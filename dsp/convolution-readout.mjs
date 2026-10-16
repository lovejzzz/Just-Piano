// Ordered copy/add of a computed 64-frame head and externally supplied tail slices.
export function combineConvolutionReadout(head,tails,mode=0,before=null){
 if(head.length!==64||tails.some(t=>t!==null&&t.length!==64)||![0,1].includes(mode)||mode===1&&before?.length!==64)throw new Error('Unverified convolution readout shape');
 const out=Float32Array.from(head);
 if(mode===1)for(let i=0;i<64;i++)out[i]=Math.fround(before[i]+head[i]);
 for(const tail of tails)if(tail!==null)for(let i=0;i<64;i++)out[i]=Math.fround(out[i]+tail[i]);
 return out;
}
