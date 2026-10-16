import {forwardRealCore256} from './real-fft-core.mjs';
import {finalizeReal1024} from './real-fft-finalize.mjs';
import {buildReal1024Coefficients} from './real-fft-coefficients.mjs';
const coefficients=buildReal1024Coefficients();
export function forwardReal1024Stages(input){
 const core=forwardRealCore256(input,coefficients.twiddle);
 return {core,output:finalizeReal1024(core,coefficients.e)};
}
export function forwardReal1024(input){return forwardReal1024Stages(input).output;}
