// Active, moving release node in 1005e1d18. Other key/pedal branches have
// not been validated by this module. Caps and velocity are caller inputs.
import { fma32 } from './modal-kernel.mjs';
const f32 = Math.fround;

export function advanceReleasedKey({ position, velocity, dt, keyCap, softCap }) {
  if (![position, velocity, dt, keyCap, softCap].every(Number.isFinite)) {
    throw new TypeError('Finite release-node inputs required');
  }
  [position, velocity, dt, keyCap, softCap] =
    [position, velocity, dt, keyCap, softCap].map(f32);
  if (position < 0 || position > 1 || velocity >= 0 || dt <= 0 ||
      keyCap < 0 || keyCap > 1 || softCap < 0 || softCap > 1) {
    throw new RangeError('Outside the active moving-release branch');
  }
  const intermediate = Math.min(keyCap, Math.max(0, fma32(dt, velocity, position)));
  return { position: Math.min(intermediate, softCap), intermediate };
}
