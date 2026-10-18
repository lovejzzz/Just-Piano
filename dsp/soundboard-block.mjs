// First SoundboardIRCompute 64-step block. This preserves the recovered
// equation but remains a diagnostic replay until every float32 operation is
// confirmed against the native block cache.
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;

function checks(values, length) {
  if (!(values instanceof Float32Array) || values.length !== length) {
    throw new RangeError(`Expected float32 vector of length ${length}`);
  }
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Non-finite soundboard state');
  }
}

function scaleRows(rows, factor) {
  return rows.map((row) => row.map((entry) => ({
    index: entry.index,
    value: f(entry.value * factor),
  })));
}

export function runSoundboardBlock({
  matrixA,
  matrixC,
  controls,
  current,
  previous,
  excitation,
  excitationIndex,
  weights,
  steps = 64,
}) {
  const stateLength = matrixA.length;
  if (matrixC.length !== stateLength || !Number.isInteger(excitationIndex) ||
      excitationIndex < 0 || excitationIndex >= stateLength) {
    throw new RangeError('Aligned matrices and valid excitation index required');
  }
  checks(current, stateLength);
  checks(previous, stateLength);
  if (!(weights instanceof Float32Array) || weights.length !== steps + 1) {
    throw new RangeError('Block weights must contain steps + 1 samples');
  }
  for (const name of ['rho', 'alpha', 'beta', 'eta', 'epsilon']) {
    if (!Number.isFinite(controls[name])) throw new RangeError(`Finite ${name} required`);
  }
  const block = new Float32Array(stateLength * 65);
  for (let index = 0; index < stateLength; index++) {
    block[index * 65] = f(weights[0] * current[index]);
  }
  let state = Float32Array.from(current);
  let velocity = Float32Array.from(previous);
  const scaledA = scaleRows(matrixA, controls.alpha);
  const scaledC = scaleRows(matrixC, controls.beta);
  for (let step = 0; step < steps; step++) {
    const difference = Float32Array.from(state, (value, index) => f(value - velocity[index]));
    const nextVelocity = new Float32Array(stateLength);
    for (let index = 0; index < stateLength; index++) {
      let accumulator = f(controls.rho * velocity[index]);
      for (const entry of scaledA[index]) {
        accumulator = fma32(entry.value, state[entry.index], accumulator);
      }
      for (const entry of scaledC[index]) {
        accumulator = fma32(entry.value, difference[entry.index], accumulator);
      }
      nextVelocity[index] = fma32(controls.eta, state[index], accumulator);
    }
    const oldState = state;
    state = nextVelocity;
    velocity = oldState;
    if (step < excitation.length) {
      state[excitationIndex] = fma32(
        controls.epsilon, excitation[step], state[excitationIndex],
      );
    }
    for (let index = 0; index < stateLength; index++) {
      block[index * 65 + step + 1] = f(weights[step + 1] * state[index]);
    }
  }
  return {block, current: state, previous: velocity};
}

export function runSoundboardCompute({
  matrixA,
  matrixC,
  controls,
  steps = controls.steps,
  weights,
  excitation,
  excitationIndex,
  captureBlockStarts = [],
  onBlock,
}) {
  if (!Number.isInteger(steps) || steps <= 0 ||
      !(weights instanceof Float32Array) || weights.length < steps) {
    throw new RangeError('Valid steps and global weight sequence required');
  }
  if (onBlock !== undefined && typeof onBlock !== 'function') {
    throw new RangeError('Block observer must be a function');
  }
  const captures = new Set(captureBlockStarts);
  const blocks = {};
  let current = new Float32Array(matrixA.length);
  let previous = new Float32Array(matrixA.length);
  for (let start = 0; start < steps; start += 64) {
    const localWeights = new Float32Array(65);
    for (let index = 0; index < 65; index++) {
      localWeights[index] = start + index < weights.length ? weights[start + index] : 0;
    }
    const result = runSoundboardBlock({
      matrixA,
      matrixC,
      controls,
      current,
      previous,
      excitation: start === 0 ? excitation : new Float32Array(0),
      excitationIndex,
      weights: localWeights,
    });
    current = result.current;
    previous = result.previous;
    if (captures.has(start)) blocks[start] = result.block;
    if (onBlock) onBlock(result.block, start);
  }
  return {current, previous, blocks};
}
