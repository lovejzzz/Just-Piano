import {fma32} from './modal-kernel.mjs';
const f = Math.fround;
const view = new DataView(new ArrayBuffer(8));
view.setBigUint64(0, 0x3fe8f1082c6ce0a2n);
const stability = view.getFloat64(0);
const nearest = (value) => Math.floor(value + 0.5);

export function constructSoundboardGrid({sampleRate, method, width, height, propagation,
  stability0, stability1, boundary0, boundary1, sourcePosition, bridge}) {
  const values = [sampleRate, method, width, height, propagation, stability0, stability1, boundary0, boundary1, sourcePosition];
  if (!values.every((v) => Number.isFinite(v) && Number.isFinite(f(v))) ||
      ![1, 0.5].includes(f(method)) || ![sampleRate, width, height, propagation].every((v) => f(v) > 0) ||
      !(bridge instanceof Float32Array) || bridge.length !== 4 ||
      bridge.some((v) => !Number.isFinite(v) || v < 0 || v > 1) || bridge[1] < bridge[0]) {
    throw new RangeError('Supported finite soundboard geometry required');
  }
  const tau = f(1 / f(sampleRate));
  const sum = f(f(stability0) + f(stability1));
  const denominator = f(Math.sqrt(f(f(tau * f(f(propagation) * sum)) / (stability / f(method)))));
  if (!(denominator > 0)) throw new RangeError('Positive grid stability denominator required');
  const nx = Math.max(1, nearest(f(f(width) / denominator)));
  const h = f(f(width) / f(nx));
  const ny = Math.max(1, nearest(f(f(f(height) / h) + f(0.0001))));
  const size = (nx + 1) * (ny + 1);
  if (!Number.isSafeInteger(size) || size > 1000000) throw new RangeError('Grid outside supported bounds');
  const a = f(boundary0), b = f(boundary1), product = f(a * b);
  let qx, qy;
  if (product >= 1) {
    qx = f(1 / f(nx * 2)); qy = f(1 / f(ny * 2));
  } else {
    const complement = f(1 - product);
    qx = f(f(1 - b) / f(f(nx) * complement));
    qy = f(f(1 - a) / f(f(ny) * complement));
  }
  const active = [], inactive = [];
  for (let x = 0; x <= nx; x++) {
    inactive.push(x);
    for (let y = 1; y <= ny; y++) {
      const index = y * (nx + 1) + x;
      if (x === 0 || x >= nx || y >= ny || fma32(qy, f(y), f(qx * f(x))) > 1) inactive.push(index);
      else active.push(index);
    }
  }
  const top = nearest(f(bridge[2] * f(ny))), bottom = nearest(f(bridge[3] * f(ny)));
  if (top <= bottom) throw new RangeError('Descending nonempty bridge span required');
  const left = nearest(f(bridge[0] * f(nx))), right = nearest(f(bridge[1] * f(nx)));
  const step = f(f(right - left) / f(top - bottom));
  const bridgeIndices = Uint32Array.from({length: top - bottom + 1}, (_, i) =>
    (top - i) * (nx + 1) + left + nearest(f(step * f(i))));
  const sourceRow = nearest(f(f(f(height) * f(sourcePosition)) / h));
  let distance = 100000, excitationIndex = -1;
  for (const index of bridgeIndices) {
    const current = Math.abs(Math.trunc(index / (nx + 1)) - sourceRow);
    if (current < distance) {distance = current; excitationIndex = index;}
  }
  return {h, tau, nx, ny, size, qx, qy, boundaryScale: Float32Array.of(f(qx / h), f(qy / h)),
    active: Uint32Array.from(active), inactive: Uint32Array.from(inactive), bridgeIndices, excitationIndex};
}
