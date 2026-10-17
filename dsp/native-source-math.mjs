// Browser-compatible math dependencies used by source controls and tuning.
import {nativeDoubleExp2} from './native-double-exp2.mjs';
import {nativeDoubleLog2} from './native-double-log2.mjs';
import {nativeScalarExp, nativeScalarExp2f} from './native-scalar-exp.mjs';
import {nativeScalarPowf} from './native-scalar-pow.mjs';
import {nativeScalarLog10f} from './native-scalar-log10.mjs';
import {nativeScalarLog2f} from './native-scalar-log2.mjs';
export const nativeSourceMath = Object.freeze({exp2: nativeDoubleExp2, log2: nativeDoubleLog2,
  expf: nativeScalarExp, exp2f: nativeScalarExp2f, powf: nativeScalarPowf, log10f: nativeScalarLog10f, log2f: nativeScalarLog2f});
