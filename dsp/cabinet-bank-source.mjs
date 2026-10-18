// Cold ordinary NY 9->3 convolution banks from independently generated IR nodes.
// Opaque object labels are local identities; no native pointers or bank snapshots enter.
import {readIrPack} from './ir-pack.mjs';
import {compilePartitionedConvolutionPlan, compileStandardConvolutionRoutes} from './convolution-plan.mjs';

export function buildCabinetBanksFromIrPack(pack) {
  const values = readIrPack(pack), lengths = pack.source?.nodeLengths;
  if (!Array.isArray(lengths) || lengths.length !== 9 || lengths.some((n, i) => n !== (i < 3 ? 8384 : 7552)))
    throw new RangeError('Supported complete ordinary NY node lengths required');
  function bank(kind, size) {
    const counts = lengths.map(n => kind === 'head' ? 16 : Math.ceil((n - 1024) / size));
    const spectrum = (object, empty, timestamp) => ({object, empty, content: empty ? 0 : 1, timestamp});
    const inputs = counts.map((n, row) => ({cursor: 0, ready: 0,
      slots: Array.from({length: n}, (_, slot) => spectrum(`${kind}/input/${row}/${slot}`, 1, 0xffffffff))}));
    let ordinal = 0, applied = 0;
    const kernels = counts.map((n, row) => ({cursor: 0, ready: 0, slots: Array.from({length: n}, (_, slot) => {
      const key = `${row}:${kind === 'head' ? slot : ordinal}`;
      ordinal++;
      const source = values[kind].get(key);
      const result = spectrum(`${kind}/kernel/${row}/${slot}`, source ? 0 : 1, (n - 1 - slot) * size);
      if (source) {
        result.timeInput = new Float32Array(size * 2);
        result.timeInput.set(source); applied++;
      }
      return result;
    })}));
    if (applied !== values[kind].size) throw new RangeError('Every IR window must enter exactly one cold bank slot');
    const outputs = Array.from({length: 3}, (_, row) => ({fft: spectrum(`${kind}/output/${row}`, 1, 0xffffffff), history: new Float32Array(size)}));
    const routes = compileStandardConvolutionRoutes();
    const config = {blockSize: size, inputCount: 9, stepCount: 1, inputs, kernels, outputs, routes};
    config.plans = [compilePartitionedConvolutionPlan(config)];
    return config;
  }
  return {head: bank('head', 64), tail: bank('tail', 512)};
}
