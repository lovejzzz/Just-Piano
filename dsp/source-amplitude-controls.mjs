// 7a4168 / 0aefc0 / 723b14 -> 182b20: source amplitude model controls.
import {impedancePhaseCurve} from './modal-impedance.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f = Math.fround, view = new DataView(new ArrayBuffer(4));
view.setUint32(0, 0xbdebc8e3);
const negativeDbScale = view.getFloat32(0);
export function sourceAmplitudeEta(shapeDb, components) {
  shapeDb = f(shapeDb);
  if (!Number.isFinite(shapeDb) || !Number.isInteger(components) || components < 1)
    throw new RangeError('Finite float shape dB and positive component count required');
  if (shapeDb === 0 || components === 1) return {eta: 1, expfCalled: false};
  const expfInput = f(shapeDb * negativeDbScale), eta = nativeScalarExp(expfInput);
  return {eta, expfCalled: true, expfInput};
}
export function archiveAmplitudeControls({baseFields, presetFields, note, components, runtimeCurveModes}) {
  if (!Number.isFinite(note) || note < 0 || note > 127) throw new RangeError('Finite note coordinate required');
  const model = baseFields.find(row => row.object_offset === 0x2548)?.value;
  const control = presetFields.find(row => row.object_offset === 0x470)?.value;
  if (model?.curves?.length !== 10 || !control?.curves_ab?.[1] || !Number.isFinite(control.b))
    throw new RangeError('Decoded B2548 and A470 amplitude controls required');
  const curves = {B25b0: model.curves[1], B26f0: model.curves[5], B2790: model.curves[7], A530: control.curves_ab[1]};
  const evaluated = {};
  for (const [name, curve] of Object.entries(curves)) {
    const mode = runtimeCurveModes?.[name];
    if (!mode || mode.flags !== 0 || mode.special !== 0 || mode.dimension !== 1 ||
        !curve.x?.length || curve.x.length !== curve.y?.length || ![...curve.x, ...curve.y].every(Number.isFinite))
      throw new RangeError('Explicit ordinary scalar runtime curve mode required: ' + name);
    evaluated[name] = impedancePhaseCurve({...curve, ...mode}, f(note));
  }
  const shape = Math.min(1, Math.max(0, evaluated.B26f0));
  const shapeDb = Math.min(100, Math.max(0, f(f(evaluated.B25b0 * evaluated.A530) * f(control.b))));
  return {addedDecay: evaluated.B2790, shape, shapeDb, ...sourceAmplitudeEta(shapeDb, components), evaluated};
}
