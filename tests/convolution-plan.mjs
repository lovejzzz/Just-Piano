import assert from 'node:assert/strict';
import {
  compilePartitionedConvolutionPlan,
  compileStandardConvolutionRoutes,
  sameConvolutionPlan,
} from '../dsp/convolution-plan.mjs';

const slots = (count) => ({ slots: Array.from({ length: count }, () => ({})) });
const plan = compilePartitionedConvolutionPlan({
  inputs: [slots(4), slots(4)],
  kernels: [slots(3)],
  routes: [[0, 0, 0, 1.0]],
  outputs: [{}],
});
assert.deepEqual(plan, [
  [0, 0, 0], [0, 1, 0],
  [1, 0, 2], [1, 0, 1], [1, 0, 0],
  [2, 0, 0],
]);
assert.equal(sameConvolutionPlan(plan, plan), true);
assert.equal(sameConvolutionPlan(plan, plan.slice(1)), false);
assert.throws(() => compilePartitionedConvolutionPlan({ inputs: [], kernels: [], routes: [], outputs: [] }), /Complete/);
assert.throws(() => compilePartitionedConvolutionPlan({
  inputs: [slots(1)], kernels: [slots(1)], routes: [[0, 0, 2]], outputs: [{}],
}), /route/);
assert.deepEqual(compileStandardConvolutionRoutes(), [
  [0, 0, 0, 1.0, 0], [1, 1, 1, 1.0, 0], [2, 2, 2, 1.0, 0],
  [3, 0, 3, 1.0, 0], [4, 1, 4, 1.0, 0], [5, 2, 5, 1.0, 0],
  [6, 0, 6, 1.0, 0], [7, 1, 7, 1.0, 0], [8, 2, 8, 1.0, 0],
]);
assert.throws(() => compileStandardConvolutionRoutes({ inputCount: 8 }), /9-to-3/);

console.log('PASS partitioned convolution plan compilation');
