import fs from 'node:fs';
import {nativeScalarPowf} from '../dsp/native-scalar-pow.mjs';
const [input,output,...extra]=process.argv.slice(2);
if(!input||!output||extra.length)throw new Error('Usage: oracle-results.json report.json');
const data=JSON.parse(fs.readFileSync(input,'utf8'));if(!data.records?.length)throw new Error('Empty powf oracle');
const view=new DataView(new ArrayBuffer(4)),value=word=>{view.setUint32(0,parseInt(word,16));return view.getFloat32(0);},bits=v=>{view.setFloat32(0,v);return view.getUint32(0).toString(16).padStart(8,'0');};
let bitChecks=0,nanChecks=0,mismatches=0,mathPowMismatches=0;const failures=[];
for(const row of data.records){
 if(row.length!==3||row.some(x=>typeof x!=='string'||!(/^[0-9a-f]{8}$/).test(x)))throw new Error('Invalid powf oracle bits');
 const [a,b,target]=row;
 const x=value(a),y=value(b),expected=value(target),predicted=nativeScalarPowf(x,y),alternative=Math.fround(Math.pow(x,y));
 if(Number.isNaN(expected)){nanChecks++;if(!Number.isNaN(predicted))mismatches++;}
 else{bitChecks++;if(bits(predicted)!==target){mismatches++;if(failures.length<30)failures.push({a,b,target,predicted:bits(predicted)});}if(bits(alternative)!==target)mathPowMismatches++;}
}
const result={passed:mismatches===0,records:data.records.length,bitChecks,nanSemanticChecks:nanChecks,mismatches,mathPowMismatches,seed:data.seed,nanPayloadBitsNotClaimed:true,failures};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
