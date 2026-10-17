import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {applyNativeReflector,reduceNativeHessenberg} from '../dsp/native-reflector-updates.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('C oracle and NEW report required');
const view=new DataView(new ArrayBuffer(8)),bits=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
let seed=0x16ab53;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;},value=()=>((random()|0)/1048576);
const cases=[];
for(let i=0;i<2000;i++){
 const rows=1+random()%12,columns=1+random()%12,rowStart=random()%rows,rowEnd=rowStart+1+random()%(rows-rowStart),columnStart=random()%columns,columnEnd=columnStart+1+random()%(columns-columnStart),side=i%2?'left':'right';
 const length=side==='left'?rowEnd-rowStart:columnEnd-columnStart,vector=Array.from({length:length*2},()=>value()/2048);vector[0]=1;vector[1]=0;
 const values=Array.from({length:rows*columns*2},value);if(i%13===0)for(let j=0;j<values.length;j++)if(j%3===0)values[j]=j%2?-0:0;
 cases.push({op:side==='left'?'l':'r',args:{values,rows,columns,vector,side,rowStart,rowEnd,columnStart,columnEnd}});
}
for(let i=0;i<500;i++){
 const order=random()%11,values=Array.from({length:2*order*order},value);
 if(i%7===0)for(let c=0;c<order;c++)for(let r=c+1;r<order;r++){values[2*(r+order*c)]=0;values[2*(r+order*c)+1]=0;}
 cases.push({op:'h',args:{values,order}});
}
const input=cases.map(({op,args:a})=>op+' '+(op==='h'?a.order:[a.rows,a.columns,a.rowStart,a.rowEnd,a.columnStart,a.columnEnd].join(' '))+' '+(op==='h'?[]:a.vector).concat(a.values).map(bits).join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});if(run.status!==0)throw new Error('C oracle failed '+run.stderr);const lines=run.stdout.trim().split('\n');if(lines.length!==cases.length)throw new Error('Incomplete oracle');
let doubleValues=0,mismatches=0,stages=0;const failures=[];
for(let i=0;i<cases.length;i++){
 const {op,args}=cases[i],actual=lines[i].trim().split(/\s+/);if(actual.shift()!=='ok')throw new Error('Invalid C row');let predicted;
 if(op==='h'){const own=reduceNativeHessenberg(args);stages+=own.stages.length;predicted=own.stages.flatMap(s=>[s.leftBeta,s.rightBeta,...s.reflector,...s.leftWork,...s.rightWork]).concat(Array.from(own.values));}
 else{const own=applyNativeReflector(args);predicted=[own.beta,...own.work,...own.values];}
 if(predicted.length!==actual.length)throw new Error('Oracle shape differs');
 for(let j=0;j<predicted.length;j++){doubleValues++;if(bits(predicted[j])!==actual[j]){mismatches++;if(failures.length<20)failures.push({case:i,op,index:j,predicted:bits(predicted[j]),actual:actual[j]});}}
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const report={passed:!mismatches,cases:cases.length,reflectorCases:2000,hessenbergCases:500,hessenbergStages:stages,doubleValues,mismatches,failures,corpusSha256:sha(input),oracleSha256:sha(fs.readFileSync(oracle)),scope:'Independent C arithmetic and full reduction; not native Pianoteq matrix capture',generalQrVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
