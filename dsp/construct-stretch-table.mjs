// Construct stretch RHS, matrix, solution and frequency table from explicit
// model controls/stiffness and registry weights. No native target arrays read.
import {stretchIntervalRatio, stretchPartialLimit, stretchPartialCounts, stretchRawConstraints, stretchConstraintRhs} from './stretch-rhs.mjs';
import {stretchSines, buildStretchMatrix, stretchTableFromLogSolution} from './stretch-system.mjs';
import {stretchLuFactor, stretchLuSolve} from './stretch-linear.mjs';
import {nativeStretchMath} from './native-stretch-math.mjs';
export function constructStretchTable({controls, stiffnessTable, middleWeight, gramScale}, math = nativeStretchMath) {
  const rational = stretchIntervalRatio(controls.interval, math), partialLimit = stretchPartialLimit(rational);
  const partials = stretchPartialCounts(controls.weightCurve, rational);
  const constraints = stretchRawConstraints({interval: controls.interval, ratio: rational.ratio, partials,
    stiffnessTable, stretch: controls.stretch}, math);
  const prepared = stretchConstraintRhs({interval: controls.interval, raw: constraints.raw,
    referenceHz: controls.referenceHz, smoothing: controls.smoothing}, math);
  const sines = stretchSines(math);
  const matrix = buildStretchMatrix({interval: controls.interval, sines, middleWeight, gramScale});
  const solution = stretchLuSolve(stretchLuFactor(matrix), prepared.rhs);
  const table = stretchTableFromLogSolution(solution, math);
  return {rational, partialLimit, partials, constraints, prepared, sines, matrix, solution, table};
}
