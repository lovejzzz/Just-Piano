import {preprocessInverseReal1024,inverseRealCore256} from './real-fft-inverse.mjs';
import {forwardRealCore256} from './real-fft-core.mjs';
import {finalizeReal1024} from './real-fft-finalize.mjs';
import {buildReal1024Coefficients} from './real-fft-coefficients.mjs';
const coefficients=buildReal1024Coefficients();
export function forwardReal1024Stages(input){
 const core=forwardRealCore256(input,coefficients.twiddle);
 return {core,output:finalizeReal1024(core,coefficients.e)};
}
export function forwardReal1024(input){return forwardReal1024Stages(input).output;}

export function inverseReal1024(input){return inverseRealCore256(preprocessInverseReal1024(input,coefficients.e),coefficients.twiddle);}
