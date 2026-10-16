// 9511bc: gather post-excitation source tables into grouped voice lanes.
// Group construction and the post-excitation source values remain upstream.
export function mapVoiceSource({ source, columns, zeroAdjustmentRows, referenceRow, layout, indices }) {
  const names = ['frequency', 'decay', 'amplitude', 'phase'];
  const size = source.frequency?.length;
  if (!Number.isInteger(columns) || columns < 1 || !size || size % columns ||
      !names.every(name => source[name]?.length === size && Array.from(source[name]).every(Number.isFinite)))
    throw new RangeError('Complete rectangular source tables required');
  const rows = size / columns;
  if (!Array.isArray(zeroAdjustmentRows) || zeroAdjustmentRows.length !== 2 ||
      !zeroAdjustmentRows.every(x => Number.isInteger(x) && x >= 0 && x <= rows) ||
      zeroAdjustmentRows[0] > zeroAdjustmentRows[1] || !Number.isInteger(referenceRow) || referenceRow < 0 || referenceRow >= rows)
    throw new RangeError('Invalid source row boundaries');
  let end = 0;
  for (const [start, padded, capacity, count] of layout) {
    if (![start, padded, capacity, count].every(Number.isInteger) || start < end || count < 0 ||
        capacity < count || padded < start + count || start % 4 || padded > 8192)
      throw new RangeError('Invalid or overlapping voice groups');
    end = padded;
  }
  if (!layout.length || indices.length < Math.max(...layout.map(([start, , , count]) => start + count)))
    throw new RangeError('Incomplete source index map');
  const result = Object.fromEntries([...names, 'J'].map(name => [name, new Float32Array(end)]));
  for (const [start, , , count] of layout) for (let lane = start; lane < start + count; lane++) {
    const index = indices[lane];
    if (!Number.isInteger(index) || index < 0 || index >= size) throw new RangeError('Source index outside table');
    for (const name of names) result[name][lane] = source[name][index];
    const row = Math.floor(index / columns);
    if (row < zeroAdjustmentRows[0] || row >= zeroAdjustmentRows[1])
      result.J[lane] = Math.fround(result.frequency[lane] - Math.fround(source.frequency[row * columns]));
  }
  result.referenceDecay = Math.fround(source.decay[referenceRow * columns]);
  return result;
}
