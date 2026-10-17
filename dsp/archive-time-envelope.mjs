// 1c9104–1c91f8: archive object1470 -> global attack/legato controls.
// Only exact curve knots and constant curves are accepted here. Interpolation
// modes have not been established for this field by this experiment.
const f=Math.fround;
function atKnot(curve,note){
 const {x,y}=curve??{};
 if(!Array.isArray(x)||!Array.isArray(y)||!y.length||![...x,...y].every(Number.isFinite))throw new Error('Finite scalar time curve required');
 if(!x.length){if(y.length!==1)throw new Error('Scalar constant time curve required');return f(y[0]);}
 if(x.length!==y.length||x.some((v,i)=>i&&f(v)<=f(x[i-1])))throw new Error('Increasing scalar time curve required');
 const index=x.findIndex(v=>f(v)===note);
 if(index<0)throw new Error('Time curve interpolation not verified: exact knot required');
 return f(y[index]);
}
export function archiveTimeEnvelopeAtKnot({editFields,note}){
 if(!Number.isFinite(note))throw new Error('Finite time-model note required');
 note=f(note);
 const fields=editFields?.filter(r=>r.object_offset===0x1470);
 if(fields?.length!==1||fields[0].kind!=='1470')throw new Error('Unique decoded object1470 required');
 const o=fields[0].value;
 if(o?.version!==3||![o.a,o.b].every(Number.isFinite))throw new Error('Time object version3 required');
 const attackSum=f(f(o.a)+atKnot(o.curve_a,note));
 const legatoAttack=f(f(o.b)+atKnot(o.curve_b,note));
 // FCVT to double then compare against the native 0x3f50624dd2f1a9fc
 // threshold (.001), before the float32 zero/ten clamp.
 const globalAttack=Math.min(10,Math.max(0,attackSum<.001?0:attackSum));
 return {note,globalAttack,legatoAttack,curveInterpolationUsed:false};
}
