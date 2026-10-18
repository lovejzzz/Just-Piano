// A continuous diagnostic engine. Voice endpoints and numeric controls are
// external inputs; every downstream audio signal/history is calculated here.
import { accumulateKeyMono64 } from './key-mono-accumulation.mjs';
import { KeyResonance64 } from './key-resonance.mjs';
import { GlobalModalRecurrence64 } from './global-modal-recurrence.mjs';
import { GlobalDriveCore64, DRIVE_STATIC_OFFSETS } from './global-drive-core.mjs';
import { GlobalRoomExcitation64 } from './global-room-excitation.mjs';
import { ScalarAllpass } from './scalar-allpass.mjs';
import { createRoutedDelayCache, routeConstantBlock, readRoutedBlock } from './routed-delay-cache.mjs';
import { injectWorkspaceFeedback } from './workspace-feedback.mjs';
import { GlobalRoutedMix64 } from './global-routed-mix.mjs';
import { buildCabinetBanksFromIrPack } from './cabinet-bank-source.mjs';
import { CabinetConvolution64 } from './cabinet-convolution.mjs';
import { DryStereoPost64 } from './dry-stereo-post.mjs';
import { fma32 } from './modal-kernel.mjs';

const word = new DataView(new ArrayBuffer(4));
const fromBits = x => { word.setUint32(0, x, true); return word.getFloat32(0, true); };
export function routeEntries(mapping) {
  return mapping.entries.map(e => {
    if (e.tapWords.length !== 6) throw Error('Single complete route tap required');
    const w = e.tapWords.map(fromBits);
    return { source: e.source, destination: e.destination, taps: [{ delay: w[0], startGain: w[1], endGain: w[2], multiplier: w[4] }] };
  });
}
const add = (destination, source, gain) => gain === 0 ? destination : Float32Array.from(destination, (x, i) => fma32(source[i], gain, x));

export class ObservedVoiceStereo64 {
  constructor(profile, irPack, driveProfile) {
    this.profile = profile; this.block = 0;
    this.keys = profile.keys.map(config => new KeyResonance64(config));
    this.modal = profile.modal.map(config => new GlobalModalRecurrence64(config));
    const staticWords = new Uint32Array(68);
    if (JSON.stringify(driveProfile.words.map(x => x[0])) !== JSON.stringify(DRIVE_STATIC_OFFSETS)) throw Error('Complete drive profile required');
    driveProfile.words.forEach(([offset, value]) => { staticWords[offset / 4] = value; });
    this.drive = new GlobalDriveCore64({ stateWords: [...staticWords], window: driveProfile.window,
      initial: { previousLevel: -1, peak: 0, cursor: 0, reset: 1, direction: 0 } });
    this.shared = profile.sharedCaches.map(c => createRoutedDelayCache(c));
    this.filters = profile.lattice.map(c => new ScalarAllpass(c));
    this.feedbackRoute = createRoutedDelayCache(profile.feedbackRoute.cache);
    this.feedbackEntries = routeEntries(profile.feedbackRoute.mapping);
    this.room = new GlobalRoomExcitation64(profile.room);
    this.globalMix = new GlobalRoutedMix64(profile.globalMix.cache, routeEntries(profile.globalMix.mapping), !!profile.globalMix.mapping.wrap);
    const banks = buildCabinetBanksFromIrPack(irPack);
    this.cabinet = new CabinetConvolution64(banks.head, banks.tail);
    this.post = new DryStereoPost64(structuredClone(profile.post));
  }

  process64(contributors, control) {
    if (this.block >= 2320 || control.keys.length !== this.keys.length || control.modalVersions.length !== 3 || control.driveGain !== 0 ||
        control.routeGain !== 1 || control.cabinetMode !== 1 || JSON.stringify(control.cabinetGain) !== '[1,1,0,0]')
      throw Error('Complete inspected continuous block required');
    const monoInputs = accumulateKeyMono64(contributors);
    for (const item of contributors) {
      if (item.spatial.length !== 12 || item.mappings.length !== 4 || item.groupGains.length !== 3 || item.selectionMask.some(x => x !== 1))
        throw Error('Complete observed voice endpoint required');
      for (let i = 0; i < 4; i++) {
        const input = item.spatial.slice(i === 0 ? 9 : (i - 1) * 3, i === 0 ? 12 : i * 3);
        routeConstantBlock(this.shared[i], input, routeEntries(item.mappings[i]), i === 0 ? 1 : item.groupGains[i - 1], !!item.mappings[i].wrap);
      }
    }
    const sharedRows = this.shared.map(readRoutedBlock);
    const sharedPre = [...sharedRows.slice(1).flat(), ...sharedRows[0]];
    let bodyBefore = new Float32Array(64);
    this.keys.forEach((model, index) => {
      const key = control.keys[index], coefficients = this.profile.keyCoefficients[key.version];
      if (!coefficients) throw Error('Bound key coefficients required');
      bodyBefore = model.process64(monoInputs.slots.get(index) ?? null, coefficients, key.gain, bodyBefore);
    });
    const drive = this.drive.process64(control.level, control.driveGain).output;
    const first = Float32Array.from(monoInputs.firstModal, (x, i) => Math.fround(x + drive[i]));
    const inputs = [first, monoInputs.secondModal, monoInputs.thirdModal];
    let body = bodyBefore;
    this.modal.forEach((model, i) => {
      const coefficients = this.profile.modal[i].coefficientVersions[control.modalVersions[i]];
      if (!coefficients) throw Error('Bound global modal coefficients required');
      model.setCoefficients(coefficients); body = model.process64(inputs[i], body);
    });
    const direct = add(add(monoInputs.direct, body, control.directGain), drive, control.directScratchGain);
    const mono = add(body, drive, control.scratchGain);
    const lattice = this.filters.map(filter => filter.process(mono));
    routeConstantBlock(this.feedbackRoute, lattice, this.feedbackEntries, 1, !!this.profile.feedbackRoute.mapping.wrap);
    const feedback = readRoutedBlock(this.feedbackRoute);
    const room = this.room.process64(direct, control.roomGains);
    const before = this.globalMix.process64(room, feedback, control.gateEnabled, control.rowFlags).output;
    const injected = injectWorkspaceFeedback(sharedRows.slice(1), feedback, control.feedbackGain);
    const sharedPost = [...injected.flat, ...sharedRows[0]];
    const cabinet = this.cabinet.process64(injected.flat, before, 1).output;
    const stereo = this.post.process64(cabinet, sharedRows[0]).output;
    this.block++;
    return { keyInputs: [monoInputs.firstModal, monoInputs.secondModal, monoInputs.thirdModal], bodyBefore, drive,
      first, mono, direct, room, lattice, feedback, sharedPre, sharedPost,
      cabinetInput: injected.flat, cabinetBefore: before, auxiliary: sharedRows[0], stereo };
  }
}
