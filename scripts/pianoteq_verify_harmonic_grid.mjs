import fs from 'node:fs';
import {addHarmonicGrid} from '../dsp/archive-harmonic-edits.mjs';
const [input,output]=process.argv.slice(2);if(!output)throw new Error('C synthetic JSONL and NEW report required');
const modes=Array.from({length:3},()=>({flags:0,special:0,dimension:1}));
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
let cases=0,values=0;const failures=[];
for(const line of fs.readFileSync(input,'utf8').trim().split('\n')){
 const r=JSON.parse(line),rows=r.rows.map((y,j)=>({coordinate:10+j*10,curve:{x:y.map((_,i)=>i),y}}));
 const own=addHarmonicGrid({rows,note:r.note,initial:r.initial,runtimeCurveModes:modes}).values;
 if(own.length!==r.expectedBits.length)throw new Error('Grid row length mismatch');
 for(let i=0;i<own.length;i++){values++;if(bits(own[i])!==r.expectedBits[i]&&failures.length<30)failures.push({case:cases,index:i,actual:r.expectedBits[i],predicted:bits(own[i])});}cases++;
}
const report={passed:!failures.length,cases,float32Values:values,failures,scope:'Independent scalar C accumulation oracle; integer-knot synthetic row samples',nativeVoiceVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report);if(!report.passed)process.exitCode=1;
