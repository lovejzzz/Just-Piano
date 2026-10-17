import fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {nativeHouseholderVector,nativeQrDeflation} from '../dsp/native-qr-foundation.mjs';
const [oracle,output]=process.argv.slice(2);if(!output)throw new Error('C oracle and NEW report required');
const view=new DataView(new ArrayBuffer(8)),bits=x=>{view.setFloat64(0,x);return view.getBigUint64(0).toString(16).padStart(16,'0');};
let seed=0xa19c38;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;},value=()=>((random()|0)/1048576);
const cases=[];
for(let i=0;i<2000;i++){
 const n=1+random()%25,v=Array.from({length:2*n},value);
 if(i%17===0){v[0]=0;v[1]=0;}if(i%31===0)v.fill(0);if(i%43===0)for(let j=0;j<v.length;j++)v[j]*=2**-600;
 cases.push({op:'h',n,v});
}
for(let i=0;i<2000;i++){
 const n=random()%9,v=Array.from({length:2*n*n},value),converged=random()%(n+1),tol=[0,Number.EPSILON*3,.1][i%3],floor=i%5===0?.0001:0;
 for(let j=1;j<n;j++)if(random()%3===0){v[2*(j+n*(j-1))]=i%4===0?-0:1e-20;v[2*(j+n*(j-1))+1]=0;}
 cases.push({op:'d',n,v,converged,tol,floor});
}
const input=cases.map(r=>r.op+' '+r.n+' '+(r.op==='d'?bits(r.tol)+' '+bits(r.floor)+' '+r.converged+' ':'')+r.v.map(bits).join(' ')).join('\n')+'\n';
const run=spawnSync(oracle,[],{input,encoding:'utf8',maxBuffer:32*1024*1024});if(run.status!==0)throw new Error('Oracle failed '+run.stderr);
const lines=run.stdout.trim().split('\n');if(lines.length!==cases.length)throw new Error('Incomplete oracle');
let mismatches=0,doubleValues=0,indexValues=0;const failures=[];
const compare=(i,name,a,b)=>{if(a!==b){mismatches++;if(failures.length<30)failures.push({case:i,name,predicted:a,actual:b});}};
for(let i=0;i<cases.length;i++){
 const r=cases[i],actual=lines[i].trim().split(/\s+/);let own;
 if(r.op==='h'){const h=nativeHouseholderVector(r.v);own=[h.sumSquares,...h.values];}
 else{const d=nativeQrDeflation({values:r.v,order:r.n,relativeTolerance:r.tol,absoluteFloor:r.floor,converged:r.converged});compare(i,'left',String(d.left),actual.shift());compare(i,'converged',String(d.converged),actual.shift());indexValues+=2;own=Array.from(d.values);}
 if(own.length!==actual.length)throw new Error('Incomplete numeric row');
 for(let j=0;j<own.length;j++){doubleValues++;compare(i,'double:'+j,bits(own[j]),actual[j]);}
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={passed:!mismatches,cases:cases.length,householderCases:2000,deflationCases:2000,doubleValues,indexValues,mismatches,failures,corpusSha256:sha(input),oracleSha256:sha(fs.readFileSync(oracle)),scope:'Independent C and runtime arithmetic; not native Pianoteq matrix capture',generalQrVerified:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
