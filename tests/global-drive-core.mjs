import assert from 'node:assert/strict';
import { GlobalDriveCore64 } from '../dsp/global-drive-core.mjs';

function profile(gain = 1) {
  const words = new Uint32Array(68), view = new DataView(words.buffer);
  const set = (offset, value) => view.setFloat32(offset, value, true);
  set(0x14, gain); set(0x20, 1); set(0x34, 1); set(0x48, 1); set(0xfc, 1);
  words[0xa0 / 4] = 4; words[0xd0 / 4] = 1;
  return { stateWords: [...words], window: [1, 2, 3, 4],
    initial: { previousLevel: -1, peak: 0, cursor: 0, reset: 1, direction: 0 } };
}
const model = new GlobalDriveCore64(profile());
const first = model.process64(1, 0);
assert.deepEqual([...first.output.slice(0, 10)], [1, 2, 3, 4, 2, 3, 4, 2, 3, 4]);
assert.equal(model.powCalls, 0);
const zero = model.process64(0, 0);
assert(zero.output.every(x => Object.is(x, 0)));
assert.deepEqual(zero.resetSamples, [0]);
assert.equal(model.cursor, 0);
assert.equal(model.historyResets, 1);
const disabled = new GlobalDriveCore64(profile(0));
assert(disabled.process64(1, 0).output.every(x => Object.is(x, 0)));
assert.equal(disabled.previousLevel, -1);
assert.equal(disabled.reset, true);
const invalid = profile(); invalid.stateWords[0x3c / 4] = 1;
assert.throws(() => new GlobalDriveCore64(invalid));
console.log('global drive: waveform cursor, fallback, silence reset and disabled branch passed');
