// 1c64d8..6744 builds repeated-strike controls/history; 1c7b18..50 gains.
import {archiveRepeatedStrikeFields} from './archive-repeat-model.mjs';
import {linearModelCurve} from './model-curves.mjs';
import {runtimeCurveModeFromArchiveCurve} from './runtime-context-from-archive.mjs';
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;
function field(rows, offset) {
  const found = rows?.filter(r => r.object_offset === offset);
  if (found?.length !== 1) throw new Error('Unique history archive field required: ' + offset.toString(16));
  return found[0].value;
}
function scalar(curve, note) {
  runtimeCurveModeFromArchiveCurve(curve, 'excitation history scalar');
  const values = linearModelCurve(curve, note, {runtimeMode: 'linear-clamp'});
  if (values.length !== 1) throw new Error('Ordinary scalar history control required');
  return values[0];
}
function ordinaryCurve(curve) {
  runtimeCurveModeFromArchiveCurve(curve, 'history curve list member');
  if (!Array.isArray(curve.x) || !curve.x.length || curve.x.length !== curve.y?.length ||
      ![...curve.x, ...curve.y].every(v => Number.isFinite(v) && Number.isFinite(f(v))))
    throw new Error('Complete nonempty ordinary history curve required');
  const x = curve.x.map(f), y = curve.y.map(f);
  if (x.some((v, i) => i && !(v > x[i - 1]))) throw new Error('Increasing history curve required');
  return {x, y, dimension: 1, log_x: 0, special_mode: 0};
}
// 5bec68/5beca8: cached reciprocal, then round old term before fusing new.
function evaluate(curve, n) {
  const {x, y} = curve;
  if (x.length === 1 || n <= x[0]) return y[0];
  if (n >= x.at(-1)) return y.at(-1);
  const i = x.findIndex((v, j) => j + 1 < x.length && v <= n && n < x[j + 1]);
  const width = f(x[i + 1] - x[i]), reciprocal = width > 1e-30 ? f(1 / width) : 0;
  const t = f(f(n - x[i]) * reciprocal);
  return fma32(t, y[i + 1], f(f(1 - t) * y[i]));
}
export function archiveHistoryCurve(list, note) {
  if (list?.version !== 1 || !Array.isArray(list.coordinates) || !list.coordinates.length ||
      list.coordinates.length !== list.curves?.length || ![note, ...list.coordinates].every(v => Number.isFinite(v) && Number.isFinite(f(v))))
    throw new Error('Complete ordinary history curve list required');
  const coordinates = list.coordinates.map(f), curves = list.curves.map(ordinaryCurve), n = f(note);
  if (coordinates.some((v, i) => i && !(v > coordinates[i - 1]))) throw new Error('Increasing history note coordinates required');
  if (coordinates.length === 1 || n <= coordinates[0]) return {...curves[0], selection: {left: 0, right: 0, fraction: 0}};
  if (n >= coordinates.at(-1)) return {...curves.at(-1), selection: {left: curves.length - 1, right: curves.length - 1, fraction: 1}};
  const left = coordinates.findIndex((v, i) => i + 1 < coordinates.length && v <= n && n < coordinates[i + 1]), right = left + 1;
  const width = f(coordinates[right] - coordinates[left]), fraction = width > 1e-30 ? f(f(n - coordinates[left]) / width) : 1;
  if (fraction === 0 || fraction === 1) return {...curves[fraction === 0 ? left : right], selection: {left, right, fraction}};
  const a = curves[left], b = curves[right], x = []; let i = 0, j = 0;
  while (i < a.x.length || j < b.x.length) {
    let value;
    if (j === b.x.length || (i < a.x.length && a.x[i] <= b.x[j])) value = a.x[i++];
    else value = b.x[j++];
    if (!x.length || value > x.at(-1)) x.push(value);
  }
  return {x, y: x.map(n => fma32(fraction, evaluate(b, n), f(f(1 - fraction) * evaluate(a, n)))),
    dimension: 1, log_x: 0, special_mode: 0, selection: {left, right, fraction}};
}
export function archiveExcitationHistory({baseFields, note, sampleRate, noteBranch}) {
  if (noteBranch !== 'ordinary') throw new Error('Explicit ordinary note direction branch required');
  const compound = field(baseFields, 0x1c8), repeat = field(baseFields, 0x2100);
  if (compound?.version !== 1 || compound.curves?.length !== 7 || !Number.isFinite(f(repeat.scalar2b0)))
    throw new Error('Complete gain/history compound required');
  const generated = archiveRepeatedStrikeFields({baseFields, note, sampleRate, runtimeMode: 'linear-clamp'}), fields = generated.fields;
  const curve = archiveHistoryCurve(repeat.curve_list280, note);
  return {hardnessControls: {positiveGain: scalar(compound.curves[5], note), negativeGain: scalar(compound.curves[6], note),
    repeatScale: fields['0x380'], direction: 0}, randomScale: fields['0x394'],
    historyControls: {randomScale: fields['0x388'], upper: fields['0x38c'], lower: fields['0x390'], blend: f(repeat.scalar2b0)},
    historyCurve: {x: curve.x, y: curve.y, dimension: 1, log_x: 0, special_mode: 0},
    curveSelection: curve.selection, repeatedFields: fields, directionBranchStillExplicit: true};
}
