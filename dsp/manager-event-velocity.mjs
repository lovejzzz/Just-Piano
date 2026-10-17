// 252000 lookup consumer. Its 129-point input table is NOT reconstructed here.
import {fma32} from './modal-kernel.mjs';
const f = Math.fround;
export function mapManagerEventValue(value, {kind, table} = {}) {
  if (![0,1,2,3,16].includes(kind) || !Number.isFinite(value) || table?.length !== 129 || !table.every(Number.isFinite))
    throw new RangeError('Explicit supported event kind and complete finite 129-point table required');
  value = f(value);
  if (kind === 0 && value === 0) return value;
  const position = f(Math.max(0,Math.min(1,value))*128), index = Math.trunc(position);
  const fraction = f(position-index), complement = f(1-fraction);
  const interpolated = fma32(complement,f(table[index]),f(fraction*f(table[Math.min(index+1,128)])));
  let output = kind < 2 ? f(interpolated*0.9921875) : interpolated;
  if (kind === 1) output = Math.max(f(1/127),output);
  return Math.min(1,Math.max(kind === 16 ? -1 : 0,output));
}

// 53f524..53f5a4, with the eligibility decision supplied explicitly.
export function randomizeManagerEventValue(value, word, {kind, eligible} = {}) {
  if (!Number.isFinite(value) || ![0,1,2,3,16].includes(kind) || typeof eligible !== 'boolean' ||
      !Number.isInteger(word) || word < 0 || word > 0xffffffff)
    throw new RangeError('Finite event value, unsigned random word and explicit branch required');
  value=f(value);
  let output=kind===1 && value===0 ? 0.5 : value;
  if (eligible && [0,2].includes(kind) && value!==0) output=f(output+f(f(word/4294967296)*f(1/127)));
  return output;
}
