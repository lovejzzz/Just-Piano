import fs from 'node:fs';
import {injectWorkspaceFeedback} from '../dsp/workspace-feedback.mjs';
const [capturePath,reportPath,...extra]=process.argv.slice(2);
if(!capturePath||!reportPath||extra.length)throw new Error('Usage: capture.json report.json');
const data=JSON.parse(fs.readFileSync(capturePath,'utf8'));
if(data.schema!==1||!data.windowComplete||data.errors.length||data.minimumBlocks!==400||data.blocks!==400||data.records.length!==800)throw new Error('Complete workspace window required');
const view=new DataView(new ArrayBuffer(4)),bits=x=>{view.setFloat32(0,x);return view.getUint32(0);};
const failures=[];let floatCount=0,scalarCount=0,mismatches=0,nonzeroFeedbackBlocks=0,nonzeroGainBlocks=0;
function check(name,p,a){if(p.length!==a.length)throw new Error('Workspace array shape differs');for(let i=0;i<p.length;i++){floatCount++;if(!Number.isFinite(p[i])||!Number.isFinite(a[i]))throw new Error('Nonfinite workspace value');if(bits(p[i])!==bits(a[i])){mismatches++;if(failures.length<30)failures.push({name,index:i,predicted:p[i],actual:a[i]});}}}
function scalar(name,p,a){scalarCount++;if(p!==a){mismatches++;if(failures.length<30)failures.push({name,predicted:p,actual:a});}}
function shape(m,rows){if(m.rows!==rows||m.samples!==64||m.rowStride!==64)throw new Error('Unverified workspace layout');}
for(let n=0;n<400;n++){
 const [a,b]=data.records.slice(n*2,n*2+2);
 if(a.stage!=='workspace'||b.stage!=='cabinet'||a.ordinal!==n||b.ordinal!==n||a.B!==b.B||a.thread!==b.thread||a.maskEnabled!==0||a.feedbackPreRoute!==0||a.groups.length!==3||b.groups.length!==3)throw new Error('Invalid workspace chronology/profile');
 shape(a.flat,9);shape(b.source,9);shape(a.auxiliary,3);shape(b.auxiliary,3);shape(b.feedback,3);
 for(let g=0;g<3;g++){
  shape(a.groups[g],3);shape(b.groups[g],3);
  scalar('group:aliasBefore',(BigInt(a.flat.pointer)+BigInt(g*3*64*4)).toString(),BigInt(a.groups[g].pointer).toString());
  scalar('group:aliasAfter',a.groups[g].pointer,b.groups[g].pointer);
 }
 scalar('flat:identity',a.flat.pointer,b.source.pointer);
 const input=a.groups.map(g=>g.values),computed=injectWorkspaceFeedback(input,b.feedback.values,a.feedbackGain);
 if(b.feedback.values.some(row=>row.some(v=>v!==0)))nonzeroFeedbackBlocks++;
 if(a.feedbackGain!==0)nonzeroGainBlocks++;
 for(let g=0;g<3;g++)for(let row=0;row<3;row++){
  check('flat:before',input[g][row],a.flat.values[g*3+row]);
  check('group:after',computed.groups[g][row],b.groups[g].values[row]);
  check('flat:cabinet',computed.flat[g*3+row],b.source.values[g*3+row]);
 }
 for(let row=0;row<3;row++)check('auxiliary:unchanged',a.auxiliary.values[row],b.auxiliary.values[row]);
}
const count=floatCount+scalarCount,report={passed:!mismatches,count,matched:count-mismatches,floatCount,scalarCount,mismatches,windowComplete:true,blocks:400,
 nonzeroFeedbackBlocks,nonzeroGainBlocks,feedbackInjected:true,groupMajorFlattening:true,nineRowCabinetSourceComputed:true,preFeedbackGroupsObserved:true,feedbackBranchObserved:true,
 auxiliaryOnlyTransportVerified:true,maskAndPreRouteFeedbackNotVerified:true,completeVoiceOrBrowserEquivalence:false,failures};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
