const f = Math.fround;

export function constructSoundboardLaplacian(grid, method) {
  const {nx, ny, size, active} = grid;
  if (![nx, ny, size].every(Number.isInteger) || nx < 1 || ny < 1 || size !== (nx + 1) * (ny + 1) ||
      size > 1000000 || !(active instanceof Uint32Array) || ![1, 0.5].includes(method)) {
    throw new RangeError('Supported grid and Laplacian method required');
  }
  const diagonal = f(f(1 - method) * 0.5);
  const full = Array.from({length: size}, (_, row) => {
    const values = new Map();
    const add = (index, value) => {
      if (index >= 0 && index < size) values.set(index, f((values.get(index) ?? 0) + value));
    };
    add(row, f(f(-4 * diagonal) + f(-4 * method)));
    for (const delta of [-1, 1, -(nx + 1), nx + 1]) add(row + delta, method);
    for (const delta of [-nx - 2, -nx, nx, nx + 2]) add(row + delta, diagonal);
    return [...values].filter(([, value]) => value !== 0).sort((a, b) => a[0] - b[0])
      .map(([index, value]) => ({index, value}));
  });
  const activeIndex = new Map(Array.from(active, (index, i) => [index, i]));
  if (activeIndex.size !== active.length || active.some((i) => i >= size)) throw new RangeError('Unique active indices required');
  const reduced = Array.from(active, (index) => full[index].filter((entry) => activeIndex.has(entry.index))
    .map((entry) => ({index: activeIndex.get(entry.index), value: entry.value})).sort((a, b) => a.index - b.index));
  return {full, reduced};
}
