// Base+3c28/3c78/3cc8 -> packed+0c/10/14 -> runtime key+38/3c/40.
// The archive nests these curves at mar_param(2f10)+d18/d68/db8.
import {linearModelCurve} from './model-curves.mjs';

export function archiveKeyReleaseControls({baseFields, note, runtimeCurveMode}) {
  if (!Array.isArray(baseFields) || !Number.isInteger(note) || note < 0 || note > 127 ||
      runtimeCurveMode !== 'linear-clamp')
    throw new Error('Decoded model, integer note and explicit curve mode required');
  const block = baseFields.find(row => row.object_offset === 0x2f10);
  if (block?.kind !== 'mar_param' || !Array.isArray(block.value?.fields))
    throw new Error('Complete decoded mar_param release controls required');
  const controls = {};
  for (const [name, offset] of [['baseTime', 0xd18], ['maximumTime', 0xd68], ['amplitudeScale', 0xdb8]]) {
    const field = block.value.fields.find(row => row.object_offset === offset);
    if (field?.kind !== 'c') throw new Error('Complete key-release archive curves required');
    const value = linearModelCurve(field.value, note, {runtimeMode: runtimeCurveMode});
    if (value.length !== 1 || !Number.isFinite(value[0])) throw new Error('Scalar key-release curve required');
    controls[name] = value[0];
  }
  if (controls.baseTime <= 0 || controls.maximumTime < controls.baseTime)
    throw new Error('Positive ordered key-release time bounds required');
  return controls;
}
