// Root and ordinary output fields read by 05db2c, 013eb4, 297054, 3ca83c.
export function constructSoundboardFamilyPolicy(archive) {
  const filters = archive?.soundboards?.filters, features = archive?.modelFeatures;
  const modelFamily = filters?.[0]?.mode;
  if (![0, 1].includes(modelFamily) || !filters.every(r => r.mode === modelFamily))
    throw new RangeError('Uniform supported soundboard geometry family required');
  const rootType = features?.rootType ?? (modelFamily === 0 ? 0 : null);
  if (!Number.isInteger(rootType) || rootType < 0 || rootType > 0xffffffff)
    throw new RangeError('Explicit archive root type required for upright geometry');
  const uprightRoot = modelFamily === 1 && rootType === 1;
  const extra = archive.microphones?.output?.extra;
  if (uprightRoot && (!Array.isArray(extra) || extra.length !== 2 ||
      extra.some(v => !Number.isFinite(v) || !Number.isFinite(Math.fround(v)))))
    throw new RangeError('Finite upright height and level fields required');
  const rootLidEnabled = features?.rootLidEnabled ?? null;
  if (rootLidEnabled !== null && typeof rootLidEnabled !== 'boolean')
    throw new RangeError('Boolean archive root lid policy required');
  return {modelFamily, rootType, uprightRoot, rootLidEnabled,
    verticalOffset: uprightRoot ? Math.fround(extra[0]) : 0,
    levelDb: uprightRoot ? Math.fround(extra[1]) : 0};
}
