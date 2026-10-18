// 1d17f8 mode 3: endpoint clamp and reciprocal interpolation.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
export function positionExtraCurve(curve,input){
 const {x,y}=curve??{};
 if(!Array.isArray(x)||!Array.isArray(y)||!y.length||y.length!==(x.length||1)||![input,...x,...y].every(v=>Number.isFinite(v)&&Number.isFinite(f(v))))throw new RangeError('Finite scalar position curve required');
 const xs=x.map(f),ys=y.map(f),n=f(input);
 for(let i=1;i<xs.length;i++)if(!(xs[i]>xs[i-1]))throw new RangeError('Increasing float32 position curve required');
 if(xs.length<2||n<=xs[0])return ys[0];
 if(n>=xs.at(-1))return ys.at(-1);
 const i=xs.findIndex((v,j)=>j<xs.length-1&&v<=n&&n<xs[j+1]);
 const width=f(xs[i+1]-xs[i]),reciprocal=width>1e-30?f(1/width):0;
 const t=f(f(n-xs[i])*reciprocal);
 return fma32(f(1-t),ys[i],f(t*ys[i+1]));
}
