// Initialization-time base spectra. Both signs use the unvaried primary
// source's first frequency column, including when a later strike uses mode 1.
import {linearModelCurve} from './model-curves.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {fma32} from './modal-kernel.mjs';
const f = Math.fround, view = new DataView(new ArrayBuffer(4));
view.setUint32(0, 0x3debc8e3);
const DB_SCALE = view.getFloat32(0);
function field(rows, offset) {
  const found = rows?.filter(r => r.object_offset === offset);
  if (found?.length !== 1) throw new Error('Unique base spectrum field required');
  return found[0].value;
}
const finite = x => Number.isFinite(x) && Number.isFinite(f(x));
// 1c8a98..8c38: division interpolation, clamped ends, new term rounded first.
export function interpolateBaseSpectrum(x, y, input) {
  if (!x?.length || x.length !== y?.length || ![input, ...x, ...y].every(finite))
    throw new Error('Complete finite base spectrum grid required');
  const xs = Array.from(x, f), ys = Array.from(y, f), n = f(input);
  if (xs.some((v, i) => i && v < xs[i - 1])) throw new Error('Nondecreasing base spectrum coordinates required');
  if (xs.length === 1 || n <= xs[0]) return ys[0];
  if (n >= xs.at(-1)) return ys.at(-1);
  const i = xs.findIndex((v, j) => j + 1 < xs.length && n <= xs[j + 1]);
  const width = f(xs[i + 1] - xs[i]), t = width === 0 ? 1 : f(f(n - xs[i]) / width);
  return fma32(f(1 - t), ys[i], f(t * ys[i + 1]));
}
export function archiveExcitationBaseTables({baseFields, note, primarySource}) {
  const {rows, columns, frequency} = primarySource ?? {};
  if (!Number.isInteger(note) || note < 1 || note > 127 || !Number.isInteger(rows) || rows < 1 ||
      ![1, 2, 3].includes(columns) || frequency?.length !== rows * columns ||
      !Array.from(frequency).every(v => finite(v) && f(v) > 0))
    throw new Error('Complete initial primary source and integer note required');
  const anchors = field(baseFields, 0x10d0), row = field(baseFields, 0x1c40)?.[note - 1];
  if (!Array.isArray(anchors) || !anchors.length || !anchors.every(v => finite(v) && f(v) > 0) ||
      !Array.isArray(row) || row.length < rows || !row.every(finite)) throw new Error('Complete model frequency and modal coordinates required');
  const x = anchors.map(v => nativeScalarLogf(f(v)));
  const logFrequency = Array.from({length: rows}, (_, i) => nativeScalarLogf(f(frequency[i * columns])));
  // Source construction prunes high-frequency rows before G7b8 is exposed.
  const result = {coordinates: row.slice(0, rows).map(f)};
  for (const [name, offset] of [['negative', 0x10f0], ['positive', 0x1140]]) {
    const curve = field(baseFields, offset);
    if (curve?.version !== 32771) throw new Error('Ordinary vector spectrum curve required');
    const values = linearModelCurve(curve, note, {runtimeMode: 'linear-clamp'});
    if (values.length !== x.length || !values.every(finite)) throw new Error('One spectrum value per frequency anchor required');
    const y = values.map(v => f(v * DB_SCALE));
    result[name] = logFrequency.map(n => interpolateBaseSpectrum(x, y, n));
  }
  return result;
}
