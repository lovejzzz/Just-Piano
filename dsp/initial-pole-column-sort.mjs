// 194e5c..19505c: ascending adjacent swaps within each frequency column,
// moving raw decay with frequency, before amplitude and phase construction.
export function sortInitialPoleColumns({rows, columns, frequency, rawDecay}) {
  if (!Number.isSafeInteger(rows) || rows < 0 || ![1, 2, 3].includes(columns) ||
      frequency?.length !== rows * columns || rawDecay?.length !== rows * columns ||
      ![...frequency, ...rawDecay].every(v => Number.isFinite(v) && Number.isFinite(Math.fround(v))))
    throw new Error('Complete finite initial pole matrices required');
  const sortedFrequency = Float32Array.from(frequency), sortedDecay = Float32Array.from(rawDecay);
  const columnOrders = Array.from({length: columns}, () => Array.from({length: rows}, (_, i) => i));
  let changed, swaps = 0;
  do {
    changed = false;
    for (let col = 0; col < columns; col++) for (let row = 1; row < rows; row++) {
      const a = (row - 1) * columns + col, b = row * columns + col;
      if (sortedFrequency[a] > sortedFrequency[b]) {
        for (const values of [sortedFrequency, sortedDecay]) {
          const value = values[a]; values[a] = values[b]; values[b] = value;
        }
        const order = columnOrders[col], old = order[row - 1];
        order[row - 1] = order[row]; order[row] = old;
        changed = true; swaps++;
      }
    }
  } while (changed);
  return {frequency: sortedFrequency, rawDecay: sortedDecay, columnOrders, swaps};
}
