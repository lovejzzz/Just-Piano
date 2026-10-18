// Runtime curve modes recovered from the serialized model curve version.
// The archive stores the version, not the three logical mode fields.

export const NATIVE_ORDINARY_CURVE_VERSION = 32771;
export const NATIVE_ORDINARY_CURVE_MODE = Object.freeze({
  flags: 0,
  special: 0,
  dimension: 1,
});

export function runtimeCurveModeFromArchiveCurve(curve, label = 'curve') {
  if (!curve || !Number.isInteger(curve.version)) {
    throw new RangeError(`Complete archive ${label} required`);
  }
  if (curve.version !== NATIVE_ORDINARY_CURVE_VERSION) {
    throw new RangeError(`Unsupported archive ${label} curve version ${curve.version}`);
  }
  return {
    mode: NATIVE_ORDINARY_CURVE_MODE,
    provenance: Object.freeze({
      label,
      field: 'version',
      value: curve.version,
      mapping: 'native-ordinary-scalar',
    }),
  };
}

export function runtimeCurveModesFromArchiveModel(model) {
  const curves = model?.curves;
  if (!Array.isArray(curves) || curves.length !== 10) {
    throw new RangeError('Complete ten-curve archive model required');
  }
  return Object.freeze({
    sourceRuntimeCurve: runtimeCurveModeFromArchiveCurve(curves[6], 'B2740'),
    phaseCurve: runtimeCurveModeFromArchiveCurve(curves[9], 'B2838'),
  });
}
