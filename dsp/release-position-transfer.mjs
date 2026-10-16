// Position/flag arithmetic in 1005e1d18 and 10020df90. This module does not
// implement their voice-list maintenance, retirement or excitation side effects.
import { fma32 } from './modal-kernel.mjs';
import { fma64 } from './modal-poles.mjs';
const f32 = Math.fround;

export function produceReleasePosition({ position, intermediate, velocity, mode,
  ignorePedal, pedalDrive, pedalAmount, keyLimit, softLimit }) {
  if (![position, intermediate, velocity, pedalDrive, pedalAmount, keyLimit, softLimit]
    .every(Number.isFinite) || ![0, 1].includes(mode)) {
    throw new RangeError('Finite inputs and supported release-node mode required');
  }
  let pedal = mode === 1 ? f32(fma64(f32(pedalAmount), -0.08, 1) * pedalDrive) : f32(pedalDrive);
  if (ignorePedal) pedal = 0;
  const result = Math.min(1, Math.max(mode === 0 ? f32(intermediate) : f32(position), pedal));
  const release = result < 0.999
    ? Number(keyLimit < 0.999 || velocity < 0) | (mode & Number(softLimit < 0.999)) : 0;
  return { position: result, release, direction: Number(velocity >= 0),
    pedal: Number(mode !== 0 && f32(pedalAmount) > 0.1 && 0.999 - f32(pedalAmount) < result) };
}

export function consumeReleasePosition(s, blockSamples) {
  if (!Number.isInteger(blockSamples) || blockSamples <= 0 ||
      !Number.isInteger(s.pendingSamples) || s.pendingSamples < 0 || s.pendingSamples > 0xffffffff) {
    throw new RangeError('Positive block size and unsigned pending counter required');
  }
  let position = f32(s.currentPosition), release = s.currentRelease, direction = s.currentDirection;
  let pendingSamples = s.pendingSamples, pending = s.pending, pedalLatched = s.pedalLatched;
  if (pendingSamples > blockSamples) {
    // Native code only stores the subtracted counter on this branch. Its
    // additional retirement decision is outside this position-only module.
    return { position, release, direction, pending, pedalLatched,
      pendingSamples: pendingSamples - blockSamples };
  }
  if (pending !== 1 || (s.skipPending & 1)) {
    return { position, release, direction, pending, pedalLatched, pendingSamples };
  }
  position = f32(s.pendingPosition);
  if (!(position >= 0 && position <= 1)) throw new RangeError('Invalid pending position');
  pending = 0;
  release = s.pendingRelease;
  direction = s.pendingDirection;
  if (!(pedalLatched & 1) && s.pendingPedal === 1) pedalLatched = 1;
  if (pedalLatched & 1) {
    if (s.positionBlend !== 0) {
      position = Math.min(position, f32(1 - f32(s.positionBlend)));
      release = 1;
    }
  } else if (s.positionBlend !== 0) {
    throw new RangeError('Native consumer rejects nonzero blend without a pedal latch');
  }
  if (s.additionalCapActive === 1) {
    const cap = fma32(f32(s.additionalCapAmount), f32(f32(s.additionalCapTarget) - 1), 1);
    if (cap < 0.99) {
      position = Math.min(position, cap);
      release = 1;
    }
  }
  if (s.voiceType === 2) {
    position = Math.min(position, f32(1 - f32(s.typeTwoCap)));
    release = 1;
  }
  release = s.forceReleaseActive === 1 ? (s.forceReleaseFlag | release) & 1 : release & 1;
  return { position, release, direction, pending, pedalLatched, pendingSamples };
}
