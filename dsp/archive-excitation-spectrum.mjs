// Archive-to-spectrum controls for the observed ordinary piano branch.
// Preserve float/double conversion order, including the expf/logf round trip.
import {linearModelCurve} from './model-curves.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
const f = Math.fround, view = new DataView(new ArrayBuffer(8));
view.setBigUint64(0, 0x40026bb1bbb55516n);
const LN10 = view.getFloat64(0);
view.setUint32(0, 0x3debc8e3);
const DB_SCALE = view.getFloat32(0);
function field(rows, offset) {
  const found = rows?.filter(r => r.object_offset === offset);
  if (found?.length !== 1) throw new Error('Unique spectrum archive field required: ' + offset.toString(16));
  return found[0].value;
}
function finite(value) {
  if (!Number.isFinite(value) || !Number.isFinite(f(value))) throw new Error('Finite spectrum control required');
  return f(value);
}
function curve(rows, offset, note, dimension) {
  const value = field(rows, offset);
  if (value?.version !== 32771 || !Array.isArray(value.x) || !value.x.length ||
      value.y?.length !== dimension * value.x.length)
    throw new Error('Complete ordinary spectrum curve required');
  return linearModelCurve(value, note, {runtimeMode: 'linear-clamp'}).map(finite);
}
export function archiveExcitationSpectrum({baseFields, note, noteBranch}) {
  if (noteBranch !== 'ordinary' || !Number.isInteger(note) || note < 1)
    throw new Error('Explicit ordinary positive integer note required');
  const scales = field(baseFields, 0x1ca0), compound = field(baseFields, 0x4290);
  if (!Array.isArray(scales) || note > scales.length || compound?.version !== 3)
    throw new Error('Complete key scale and version-3 spectrum compound required');
  const lower = curve(baseFields, 0x1ad0, note, 1)[0], db = curve(baseFields, 0xa10, note, 1)[0];
  const gain = db === 0 ? 1 : nativeScalarExp(f(db * DB_SCALE));
  return {scale: finite(scales[note - 1]), slopeBlend: finite(field(baseFields, 0x15cc)),
    referenceTable: curve(baseFields, 0x1030, note, 3),
    lowerBase: finite(f(lower / 20) * LN10), lowerScale: finite(nativeScalarLogf(gain)),
    lowerUSupport: finite(compound.scalar32c)};
}
