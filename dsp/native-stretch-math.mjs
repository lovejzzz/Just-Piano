// Recovered browser math used by stretch construction. The sine projection
// is compared to system sin on every actual call in the stretch replay.
import {nativeSourceMath} from './native-source-math.mjs';
import {nativeDoublePow} from './native-double-pow.mjs';
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
export const nativeStretchMath = Object.freeze({exp2: nativeSourceMath.exp2, log2: nativeSourceMath.log2,
  pow: nativeDoublePow, sincos: nativeDoubleSinCos, sin: x => nativeDoubleSinCos(x).sin});
