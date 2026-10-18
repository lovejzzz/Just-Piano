import {auxiliaryWaveletReconstruction} from './auxiliary-wavelet-synthesis.mjs';
import {equalizeAuxiliaryWavelet} from './auxiliary-wavelet-eq.mjs';
import {shapeAuxiliaryWaveform} from './auxiliary-waveform-shaping.mjs';
export function generateAuxiliaryWaveform(descriptor){
 const reconstruction=auxiliaryWaveletReconstruction(descriptor);
 const equalized=equalizeAuxiliaryWavelet(reconstruction.samples,descriptor.vector30,reconstruction.sampleRate);
 const shaped=shapeAuxiliaryWaveform(equalized,reconstruction.sampleRate,descriptor.floats48[1]);
 return {...shaped,frames:reconstruction.frames,sampleRate:reconstruction.sampleRate,
  nativeWaveformValidated:false};
}
