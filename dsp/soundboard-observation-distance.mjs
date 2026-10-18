import {fma32} from './modal-kernel.mjs';
const f = Math.fround;

// FUN_1004bcde8: full rectangular grid, including inactive boundary points.
export function constructSoundboardObservationDistances(grid, coordinates, planeHeight) {
  if (!Number.isFinite(planeHeight) || !coordinates?.length ||
      !Number.isInteger(grid.nx) || !Number.isInteger(grid.ny) || grid.nx < 1 || grid.ny < 1 ||
      grid.size !== (grid.nx + 1) * (grid.ny + 1) || !Number.isFinite(grid.h) || grid.h <= 0 ||
      coordinates.some((point) => point.length !== 3 || point.some((v) => !Number.isFinite(v)))) {
    throw new RangeError('Finite observation coordinates and valid grid required');
  }
  const distances = new Float32Array(coordinates.length * grid.size), directions = new Float32Array(distances.length);
  coordinates.forEach((point, observation) => {
    const z = f(f(point[2]) - f(planeHeight));
    for (let x = 0; x <= grid.nx; x++) for (let y = 0; y <= grid.ny; y++) {
      const dx = fma32(-f(x), grid.h, f(point[0])), dy = fma32(-f(y), grid.h, f(point[1]));
      const xy = f(f(dx * dx) + f(dy * dy));
      const distance = Math.max(f(Math.sqrt(fma32(z, z, xy))), f(0.01));
      const index = observation * grid.size + y * (grid.nx + 1) + x;
      distances[index] = distance; directions[index] = f(z / distance);
    }
  });
  return {distances, directions};
}
