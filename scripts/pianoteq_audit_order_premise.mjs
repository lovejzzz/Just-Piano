// Establish the strict premises before any order-only full-PCM exchange.
import fs from 'node:fs';import path from 'node:path';
import {loadOrderFixture,numericalHash} from './pianoteq_order_fixture.mjs';
const [first,second,output]=process.argv.slice(2);
if(!output||fs.existsSync(output)||path.resolve(output).startsWith(path.resolve('.')+path.sep))throw Error('Usage: complete-run-A complete-run-B fresh-private-audit');
const a=loadOrderFixture(first),b=loadOrderFixture(second),failures=[],checks={};
const equal=(name,x,y)=>{const same=numericalHash(x)===numericalHash(y);checks[name]=same;if(!same)failures.push(name);return same;};
equal('fixture',a.fixture,b.fixture);equal('profile',a.profile,b.profile);equal('controls',a.controls,b.controls);equal('writers',a.writers,b.writers);
const keys=[...a.voices.keys()].sort(),otherKeys=[...b.voices.keys()].sort();
const sameKeys=equal('voiceInventory',keys,otherKeys),differentVoices=[];
if(sameKeys)for(const id of keys)if(numericalHash(a.voices.get(id))!==numericalHash(b.voices.get(id)))differentVoices.push(id);
checks.keyedVoiceSamplesAndRouting=sameKeys&&differentVoices.length===0;
if(!checks.keyedVoiceSamplesAndRouting)failures.push('keyedVoiceSamplesAndRouting');
const orderChanges=[],inventoryChanges=[];
if(a.order.length!==b.order.length)throw Error('Complete common global block extent required');
for(let block=0;block<a.order.length;block++){
 if(JSON.stringify([...a.order[block]].sort())!==JSON.stringify([...b.order[block]].sort()))inventoryChanges.push(block);
 if(JSON.stringify(a.order[block])!==JSON.stringify(b.order[block]))orderChanges.push(block);
}
checks.blockInventories=inventoryChanges.length===0;if(!checks.blockInventories)failures.push('blockInventories');
checks.distinctOrder=orderChanges.length>0;if(!checks.distinctOrder)failures.push('distinctOrder');
let pcmDifferences=0,firstPcmSample=null,maximumIntegerDifference=0;
if(a.pcm.length!==b.pcm.length)throw Error('Complete equal native PCM extents required');
for(let i=0;i<a.pcm.length;i+=3){const x=a.pcm.readIntLE(i,3),y=b.pcm.readIntLE(i,3);if(x!==y){pcmDifferences++;firstPcmSample??=i/3;maximumIntegerDifference=Math.max(maximumIntegerDifference,Math.abs(x-y));}}
checks.distinctPcm=pcmDifferences>0;if(!checks.distinctPcm)failures.push('distinctPcm');
const result={schema:1,firstRuntimeSha256:a.runtimeSha256,secondRuntimeSha256:b.runtimeSha256,checks,failures,
  changedOrderBlocks:orderChanges,changedInventoryBlocks:inventoryChanges,differentVoices,
  pcmDifferences,firstPcmSample,firstPcmFrame:firstPcmSample===null?null:Math.floor(firstPcmSample/2),maximumIntegerDifference,
  firstProfileSha256:numericalHash(a.profile),secondProfileSha256:numericalHash(b.profile),
  firstControlsSha256:numericalHash(a.controls),secondControlsSha256:numericalHash(b.controls),
  orderOnlyPremiseVerified:failures.length===0,causalExplanationProven:false,
  remaining:'Run both full-PCM order exchanges; a premise audit alone is not audio causality proof.'};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));if(failures.length)process.exitCode=1;
