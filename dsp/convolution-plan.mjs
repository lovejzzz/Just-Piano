// Compile the fixed-step partitioned-convolution schedule from ring and route
// shape. The plan is still checked against native captures before use.

export function compilePartitionedConvolutionPlan({ inputs, kernels, routes, outputs }) {
  if (!Array.isArray(inputs) || !Array.isArray(kernels) ||
      !Array.isArray(routes) || !Array.isArray(outputs) ||
      inputs.length === 0 || kernels.length === 0 || outputs.length === 0) {
    throw new RangeError('Complete convolution rings, routes and outputs required');
  }
  const kernelSlots = kernels.map((ring) => {
    if (!ring || !Number.isInteger(ring.slots?.length) || ring.slots.length < 1) {
      throw new RangeError('Every kernel ring needs slots');
    }
    return ring.slots.length;
  });
  for (const ring of inputs) {
    if (!ring || !Number.isInteger(ring.slots?.length) || ring.slots.length < 1) {
      throw new RangeError('Every input ring needs slots');
    }
  }
  const plan = [];
  for (let input = 0; input < inputs.length; input++) plan.push([0, input, 0]);
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
    const route = routes[routeIndex];
    if (!Array.isArray(route) || route.length < 3 ||
        !Number.isInteger(route[2]) || route[2] < 0 || route[2] >= kernels.length) {
      throw new RangeError(`Invalid convolution route ${routeIndex}`);
    }
    const slotCount = kernelSlots[route[2]];
    for (let lag = slotCount - 1; lag >= 0; lag--) plan.push([1, routeIndex, lag]);
  }
  for (let output = 0; output < outputs.length; output++) plan.push([2, output, 0]);
  return plan;
}

export function sameConvolutionPlan(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((entry, index) =>
    Array.isArray(entry) && entry.length === 3 &&
    entry.every((value, field) => value === b[index][field]));
}

export function compileStandardConvolutionRoutes({ inputCount = 9, outputCount = 3,
  kernelCount = 9 } = {}) {
  if (inputCount !== 9 || outputCount !== 3 || kernelCount !== 9) {
    throw new RangeError('Standard 9-to-3 convolution topology required');
  }
  return Array.from({ length: inputCount }, (_, input) => [
    input, input % outputCount, input, 1.0, 0,
  ]);
}
