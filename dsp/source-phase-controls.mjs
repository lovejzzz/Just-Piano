// 7576b4 -> B2838, consumed by cache+158 and sourcePhaseTable.
import {impedancePhaseCurve} from './modal-impedance.mjs';
export function archivePhaseAmount({baseFields, note, instrumentMode, runtimeCurveMode}) {
  if (!Number.isFinite(note) || note < 0 || note > 127 || !Number.isInteger(instrumentMode) || instrumentMode < 0 || instrumentMode > 255)
    throw new RangeError('Explicit note coordinate and instrument mode byte required');
  if (instrumentMode !== 1) return {phaseAmount: 0, curveEvaluated: false};
  const model = baseFields.find(row => row.object_offset === 0x2548)?.value;
  const curve = model?.curves?.[9], mode = runtimeCurveMode;
  if (model?.curves?.length !== 10 || !curve.x?.length || curve.x.length !== curve.y?.length ||
      ![...curve.x, ...curve.y].every(Number.isFinite) || !mode || mode.flags !== 0 || mode.special !== 0 || mode.dimension !== 1)
    throw new RangeError('Explicit ordinary scalar B2838 curve required');
  return {phaseAmount: impedancePhaseCurve({...curve, ...mode}, Math.fround(note)), curveEvaluated: true};
}
