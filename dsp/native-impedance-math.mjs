// Recovered browser-compatible math dependencies of 2ff628. No host calls.
import {nativeScalarLog2f} from './native-scalar-log2.mjs';
import {nativeDoubleExp} from './native-double-exp.mjs';
import {nativeDoubleLog} from './native-double-log.mjs';
import {nativeDoubleTan} from './native-double-tan.mjs';
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
import {nativeDoublePow} from './native-double-pow.mjs';
export const nativeImpedanceMath=Object.freeze({log2f:nativeScalarLog2f,exp:nativeDoubleExp,
  log:nativeDoubleLog,tan:nativeDoubleTan,sincos:nativeDoubleSinCos,pow:nativeDoublePow});
