import { fma32 } from './modal-kernel.mjs';
import { nativeScalarExp } from './native-scalar-exp.mjs';
import { buildLogSpectrum } from './excitation-spectrum.mjs';
const fl = Math.fround;

export function selectSupportRows({ header, source, frequencies, referenceFrequency }) {
  const [columns, rows] = header;
  const word = new DataView(new ArrayBuffer(4)); word.setUint32(0, 0x219392e0);
  const threshold = word.getFloat32(0), eligible = [];
  if (![1, 2, 3].includes(columns) || !Number.isFinite(referenceFrequency) ||
      source.amplitude.length !== columns * rows || source.frequency.length !== columns * rows)
    throw new RangeError('Complete pre-weight source required');
  if (!frequencies.length) return [];
  for (let row = 0; row < rows; row++) if (source.amplitude[row * columns] > threshold) eligible.push(row);
  if (!eligible.length) throw new RangeError('No nonzero source rows');
  let position = 0;
  return frequencies.map(frequency => {
    const target = fl(fl(referenceFrequency) * fl(frequency));
    while (position + 1 < eligible.length) {
      const current = Math.abs(fl(target - fl(source.frequency[eligible[position] * columns])));
      const next = Math.abs(fl(target - fl(source.frequency[eligible[position + 1] * columns])));
      if (next > current) break;
      position++;
    }
    return eligible[position] + 1;
  });
}

export function supportLogAmplitudes({ primary, spectrum, coordinates, baseTable, indices, tables, logOffset }) {
  const baseLog = buildLogSpectrum({ ...spectrum, coordinates, baseTable,
    extraTable: new Float32Array(baseTable.length), count: baseTable.length });
  return indices.map((row, i) => {
    if (!Number.isInteger(row) || row < 1 || row > baseLog.length || i >= tables.lowLog.length || i >= tables.highLog.length)
      throw new RangeError('Complete support row mapping and log tables required');
    const blend = fma32(fl(primary), fl(tables.highLog[i]), fl(fl(2 - fl(primary)) * fl(tables.lowLog[i])));
    return fl(fma32(blend, 0.5, baseLog[row - 1]) + fl(logOffset));
  });
}

export function appendExcitationSupport({ header, source, indices, logAmplitudes, referenceFrequencies, coordinates, tables, controls: c }) {
  const [columns, rows] = header;
  if (![1, 2, 3].includes(columns) || !Number.isInteger(rows) || rows < 1 ||
      Object.values(source).some(a => a.length !== columns * rows) || referenceFrequencies.length !== columns ||
      indices.length !== logAmplitudes.length || tables.frequencies.length < indices.length || tables.decayMultipliers.length < indices.length ||
      ![c.scale, c.frequencyLimit, c.supportScale, c.amplitudeGain, ...referenceFrequencies, ...logAmplitudes].every(Number.isFinite))
    throw new RangeError('Complete support excitation inputs required');
  if (c.repeatFlag === 1 && c.attenuation > 0) throw new RangeError('Unverified repeated-strike history branch');
  const result = Object.fromEntries(Object.entries(source).map(([key, values]) => [key, Array.from(values)]));
  const rowControls = [];
  for (let i = 0; i < indices.length; i++) {
    const multiplier = fl(tables.frequencies[i]);
    if (fl(referenceFrequencies[0] * multiplier) >= c.frequencyLimit) break;
    const row = indices[i] - 1;
    if (!Number.isInteger(row) || row < 0 || row >= rows || row >= coordinates.length) throw new RangeError('Invalid support row');
    let sum = 0;
    for (let column = 0; column < columns; column++) sum = fl(sum + fl(result.decay[row * columns + column]));
    const meanDecay = fl(sum / fl(columns));
    let decay = fl(fl(tables.decayMultipliers[i]) * meanDecay);
    if (c.supportMode === 3 && c.supportScale >= 1) decay = fl(fl(c.supportScale) * decay);
    const exponent = fma32(-fl(c.scale), fl(coordinates[row]), fl(logAmplitudes[i]));
    const amplitude = fl(fl(c.amplitudeGain) * nativeScalarExp(exponent));
    rowControls.push({ row, meanDecay, decay, exponent, amplitude });
    for (let column = 0; column < columns; column++) {
      const frequency = fl(fl(referenceFrequencies[column]) * multiplier);
      result.frequency.push(frequency); result.decay.push(decay);
      result.amplitude.push(frequency < c.frequencyLimit && frequency > 13.5 ? amplitude : 0);
      result.phase.push(0);
    }
  }
  const appended = rowControls.length;
  let splitFactor;
  if (columns === 1 && appended) {
    if (c.splitCoordinates.length < 2 || !(result.frequency[rows] > 0)) throw new RangeError('Single-string split controls required');
    splitFactor = fl(fl(fl(fl(c.singleSplit) * fl(fl(c.splitCoordinates[1]) - fl(c.splitCoordinates[0]))) / result.frequency[rows]) + 1);
    for (let i = 0; i < appended; i++) {
      const index = rows + i;
      result.frequency.push(fl(splitFactor * result.frequency[index]));
      result.decay.push(result.decay[index]);
      result.amplitude[index] = fl(result.amplitude[index] * 0.5);
      result.amplitude.push(result.amplitude[index]); result.phase.push(0);
    }
  }
  const appendedHeader = [...header]; appendedHeader[1] = rows + appended * (columns === 1 ? 2 : 1);
  const finalHeader = [...appendedHeader]; finalHeader[5] = rows;
  return { header: finalHeader, appendedHeader, source: result, rowControls, appended, splitFactor };
}

export function appendSecondExcitationSupport(first, { secondIndices, secondLogAmplitudes, secondReferenceFrequencies,
  coordinates, tables, controls: c }) {
  const columns = first.header[0], originalRows = first.header[5];
  if (secondIndices.length !== secondLogAmplitudes.length || secondReferenceFrequencies.length !== columns ||
      tables.secondFrequencies.length < secondIndices.length || tables.secondDecay.length < secondIndices.length ||
      !Number.isFinite(c.secondAmplitudeGain)) throw new RangeError('Complete second support family required');
  const source = Object.fromEntries(Object.entries(first.source).map(([key, values]) => [key, Array.from(values)]));
  const rowControls = [];
  for (let i = 0; i < secondIndices.length; i++) {
    const row = secondIndices[i] - 1;
    if (!Number.isInteger(row) || row < 0 || row >= originalRows || row >= coordinates.length)
      throw new RangeError('Invalid second support reference row');
    let sum = 0;
    for (let column = 0; column < columns; column++) sum = fl(sum + source.decay[row * columns + column]);
    const decay = fl(fl(sum / fl(columns)) * fl(tables.secondDecay[i]));
    const exponent = fma32(-fl(c.scale), fl(coordinates[row]), fl(secondLogAmplitudes[i]));
    const amplitude = fl(nativeScalarExp(exponent) * fl(c.secondAmplitudeGain));
    rowControls.push({ row, decay, exponent, amplitude });
    for (let column = 0; column < columns; column++) {
      const frequency = fl(fl(secondReferenceFrequencies[column]) * fl(tables.secondFrequencies[i]));
      source.frequency.push(frequency); source.decay.push(decay);
      source.amplitude.push(frequency < c.frequencyLimit ? amplitude : 0); source.phase.push(0);
    }
  }
  const header = [...first.header]; header[1] += secondIndices.length;
  return { ...first, header, source, secondRowControls: rowControls };
}
