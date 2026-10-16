// Arithmetic recovered from arm64 38750c, 83d144, 04c5c8 and 8a3650.
// Native transcendental dependencies and runtime curve modes are explicit.
import { fma32 } from './modal-kernel.mjs';
import { impedancePhaseCurve } from './modal-impedance.mjs';
const f = Math.fround;
const wordView = new DataView(new ArrayBuffer(4));
const fw = word => { wordView.setUint32(0, word); return wordView.getFloat32(0); };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const roundAway = x => x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
const field = (fields, offset) => {
  const row = fields.find(row => row.object_offset === offset);
  if (!row) throw new RangeError(`Missing archive field 0x${offset.toString(16)}`);
  return row.value;
};

export function sourceArchiveInputs(baseFields, presetFields) {
  const b = offset => field(baseFields, offset), a = offset => field(presetFields, offset);
  const controls = a(0x470), model = b(0x2548);
  return { b, a, controls, model, curves: {
    B1b40: b(0x1b40), B1b98: b(0x1b98), B2560: model.curves[0],
    // 86c184 serializes scalar +18 and curve +c0 before scalar +4/curve +70.
    // JSON member order is serialization order, not increasing object offset.
    A490: controls.curves_ab[0], A4e0: controls.curve_c, Af48: a(0xf48),
  } };
}

function evaluator(input, modes) {
  return (name, note) => {
    const mode = modes?.[name];
    if (!mode || !Number.isInteger(mode.flags) || !Number.isInteger(mode.dimension) || !Number.isInteger(mode.special))
      throw new RangeError(`Explicit runtime curve mode required: ${name}`);
    return impedancePhaseCurve({ ...input.curves[name], ...mode }, note);
  };
}

// 88027c selects adjacent rows of B1d30 using uint32 note anchors B1bf8.
function offsetRows(anchors, note) {
  if (anchors.length < 2 || anchors.some((v, j) => !Number.isInteger(v) || (j && anchors[j - 1] >= v)))
    throw new RangeError('Strictly increasing note anchors required');
  let left = 0;
  while (left + 1 < anchors.length - 1 && note > f(anchors[left + 1])) left++;
  const width = f(f(anchors[left + 1]) - f(anchors[left]));
  return { left, right: left + 1, fraction: clamp(f(f(note - f(anchors[left])) / width), 0, 1) };
}

export function sourceOffsets(input, note, runtimeCurveModes) {
  note = f(note);
  const { b, a, model, controls } = input, evaluate = evaluator(input, runtimeCurveModes);
  if (f(a(0x1398)) !== 0 && b(0x158) === 0)
    throw new RangeError('Ageing randomization of offsets is not implemented');
  const count = model.indexmap[roundAway(note)];
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Missing component count');
  const anchors = b(0x1bf8), matrix = b(0x1d30), selection = offsetRows(anchors, note);
  const columns = matrix.length / anchors.length;
  if (!Number.isInteger(columns) || columns < count) throw new RangeError('Invalid offset matrix shape');
  const amount = clamp(f(f(evaluate('A490', note) * f(controls.a)) * evaluate('B2560', note)), 0, 50);
  const skew = clamp(f(f(controls.c) + evaluate('A4e0', note)), -2, 2);
  const alpha = selection.fraction, complement = f(1 - alpha);
  const offsets = Array.from({ length: count }, (_, j) => f(amount *
    fma32(complement, f(matrix[selection.left * columns + j]), f(alpha * f(matrix[selection.right * columns + j])))));
  if (count >= 3) {
    const first = offsets[0], last = offsets.at(-1);
    const subtract = f(Math.min(0, skew) * first), add = Math.max(0, skew), multiplier = f(1 - Math.abs(skew));
    // Native vectorized prefix has separate mul/sub/add. Scalar tail uses
    // FNMSUB then FMADD. Its length follows compiler thresholds in 3877d8.
    const middleCount = count - 2;
    const vectorCount = middleCount > 3 ? Math.floor(middleCount / 4) * 4 : 0;
    for (let j = 1; j < count - 1; j++) {
      offsets[j] = j <= vectorCount
        ? f(f(f(offsets[j] * multiplier) - subtract) + f(add * last))
        : fma32(add, last, fma32(multiplier, offsets[j], -subtract));
    }
  }
  return { offsets: offsets.map(value => Math.min(value, 400)), selection, amount, skew, count, columns };
}

// 83d144 returns a double-valued cents displacement. The ordinary analytic
// branch computes a float result; the B1b40 branch finishes in double.
export function sourceStiffnessCents(input, note, runtimeCurveModes, math) {
  for (const name of ['powf', 'expf', 'log10f', 'log2'])
    if (typeof math?.[name] !== 'function') throw new TypeError(`Native ${name} dependency required`);
  const { b, a } = input, evaluate = evaluator(input, runtimeCurveModes);
  note = f(note);
  const user = clamp(f(f(a(0xf40)) * evaluate('Af48', note)), fw(0x3dcccccd), 30);
  const actualPower = f(f(math.powf(f(user / 10), fw(0x3f59999a))) * 10);
  const basePower = f(f(math.powf(f(f(b(0x14e0)) / 10), fw(0x3f59999a))) * 10);
  const actualShape = fma32(Math.max(f(1 - actualPower), 0), fw(0x3e99999a), actualPower);
  const baseShape = fma32(Math.max(f(1 - basePower), 0), fw(0x3e99999a), basePower);
  const pivot = f(b(0x1b30)), pivotMinus12 = f(pivot - 12);
  const baseShift = f(f(pivotMinus12 * f(baseShape + fw(0xbfea3d71))) / fw(0x4102b852));
  const actualShift = f(f(pivotMinus12 * f(actualShape + fw(0xbfea3d71))) / fw(0x4102b852));
  const shift = f(f(actualShift + f(roundAway(baseShift))) - baseShift);
  const exponential = f(math.expf(-f(f(b(0x1b24)) * shift)));
  const power = f(math.powf(f(fw(0x3fea3d71) / actualShape), 8));
  const common = f(fma32(power, fw(0x3dccccd0), fw(0x3f666666)) * exponential);
  let cents;
  const curveBranch = input.curves.B1b40.y.length !== 0;
  if (curveBranch) {
    const adjustment = evaluate('B1b40', f(shift + note));
    const gain = f(math.expf(f(f(f(math.log10f(common)) + adjustment) * fw(0x40135d8e))));
    cents = Math.min(math.log2(Math.sqrt(gain + 1)) * 1200, 2400);
  } else {
    const coordinate = f(f(shift - pivot) + note);
    const root = f(Math.sqrt(fma32(coordinate, coordinate, f(b(0x1b3c)))));
    const rootBase = f(Math.sqrt(f(b(0x1b3c))));
    const gain = f(math.expf(f(f(b(0x1b38)) * f(root - rootBase))));
    cents = Math.min(f(f(f(b(0x1b2c)) * common) * gain), 2400);
  }
  return { cents, curveBranch, shift, common, actualShape, baseShape };
}

export function archiveSourceControls({ baseFields, presetFields, note, runtimeCurveModes, math }) {
  if (!Number.isInteger(note) || note < 0 || note > 127) throw new RangeError('Integer MIDI note required');
  const input = sourceArchiveInputs(baseFields, presetFields);
  // 8a3950 uses scale=1 unless ageing affects frequency. Aged scale recovery
  // needs the upstream tuning state and is deliberately not inferred here.
  if (f(input.a(0x1398)) !== 0) throw new RangeError('Full source controls currently require ageing=0');
  for (const name of ['exp2', 'log2f'])
    if (typeof math?.[name] !== 'function') throw new TypeError(`Native ${name} dependency required`);
  const evaluate = evaluator(input, runtimeCurveModes), results = new Map();
  const stiffnessAt = key => {
    if (!results.has(key)) {
      const result = sourceStiffnessCents(input, key, runtimeCurveModes, math);
      results.set(key, { ...result, stiffnessDouble: math.exp2(result.cents / 600) - 1 });
    }
    return results.get(key);
  };
  const componentNotes = input.model.vectors[0].map(value => clamp(roundAway(fma32(f(math.log2f(f(value))), -12, f(note))), 0, 127));
  const offsets = sourceOffsets(input, note, runtimeCurveModes);
  return { note, stiffness: f(stiffnessAt(note).stiffnessDouble),
    spread: evaluate('B1b98', note), offsets: offsets.offsets,
    componentStiffness: componentNotes.map(key => f(stiffnessAt(key).stiffnessDouble)),
    frequencyRatios: input.model.vectors[0].map(f), componentNotes, offsetDetails: offsets,
    stiffnessDetails: Array.from(results, ([note, result]) => ({ note, ...result })), stiffnessScale: 1 };
}
