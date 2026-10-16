// Reconstructed arithmetic, validated against observed runtime states.
// This is one modal kernel, not a complete piano model or a preset library.
const f32 = Math.fround;
const scratch = new DataView(new ArrayBuffer(4));
const MAX_FLOAT = 3.4028234663852886e38;
const OVERFLOW_MIDPOINT = 2 ** 128 - 2 ** 103;

function adjacent(value, direction) {
  if (value === 0) return direction * 2 ** -149;
  scratch.setFloat32(0, value, true);
  let bits = scratch.getUint32(0, true);
  bits += (value > 0) === (direction > 0) ? 1 : -1;
  scratch.setUint32(0, bits, true);
  return scratch.getFloat32(0, true);
}

// A product of two float32 inputs is exact in double. TwoSum retains the
// addition's rounding error. Only a double exactly on a float32 midpoint can
// require correction; ordinary Math.fround(a*b+c) loses this tie information.
export function fma32(a, b, c) {
  a = f32(a);
  b = f32(b);
  c = f32(c);
  const product = a * b;
  const sum = product + c;
  const rounded = f32(sum);
  if (!Number.isFinite(sum)) return rounded;
  const z = sum - product;
  const error = (product - (sum - z)) + (c - z);
  if (error === 0) return rounded;
  if (!Number.isFinite(rounded)) {
    return Math.abs(sum) === OVERFLOW_MIDPOINT && Math.sign(sum) * error < 0
      ? Math.sign(sum) * MAX_FLOAT
      : rounded;
  }
  const direction = Math.sign(sum - rounded);
  if (direction === 0) return rounded;
  const next = adjacent(rounded, direction);
  if (!Number.isFinite(next)) {
    return Math.abs(sum) === OVERFLOW_MIDPOINT && Math.sign(sum) * error > 0
      ? next
      : rounded;
  }
  return sum === (rounded + next) * 0.5 && Math.sign(error) === direction
    ? next
    : rounded;
}

function add(a, b) {
  return f32(a + b);
}

function reduceFourGroups(values) {
  const lanes = [0, 0, 0, 0];
  for (let lane = 0; lane < 4; lane++) {
    lanes[lane] = add(add(add(values[lane], values[4 + lane]), values[8 + lane]), values[12 + lane]);
  }
  return add(add(lanes[0], lanes[2]), add(lanes[1], lanes[3]));
}

// Mirrors the observed 16-lane, four-sample-unrolled no-input path.
// A/B are separate 16-lane arrays; P/Q are updated in place. The output may
// already contain earlier modal groups and is accumulated in float32.
export function renderSixteen(P, Q, A, B, output) {
  if ([P, Q, A, B].some((array) => array.length !== 16) || output.length % 4) {
    throw new RangeError('Expected 16 lanes and a multiple of four output samples');
  }
  const first = new Float32Array(16);
  const second = new Float32Array(16);
  const third = new Float32Array(16);
  const fourth = new Float32Array(16);
  for (let sample = 0; sample < output.length; sample += 4) {
    for (let lane = 0; lane < 16; lane++) {
      first[lane] = fma32(B[lane], Q[lane], f32(A[lane] * P[lane]));
      second[lane] = fma32(A[lane], Q[lane], f32(B[lane] * first[lane]));
      third[lane] = fma32(A[lane], first[lane], f32(B[lane] * second[lane]));
      fourth[lane] = fma32(A[lane], second[lane], f32(B[lane] * third[lane]));
    }
    output[sample] = add(output[sample], reduceFourGroups(P));
    output[sample + 1] = add(output[sample + 1], reduceFourGroups(Q));
    output[sample + 2] = add(output[sample + 2], reduceFourGroups(first));
    output[sample + 3] = add(output[sample + 3], reduceFourGroups(second));
    P.set(third);
    Q.set(fourth);
  }
  return output;
}
