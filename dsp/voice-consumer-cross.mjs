// 460a4c -> 460acc: group/aux clears and two explicitly inactive processors.
// Active processor implementations remain a separate, unverified path.
export function processVoiceConsumerCross(groups,auxiliary,controls){
 for(const key of ['keepGroups','keepAuxiliary','processorA','processorB'])if(!Number.isInteger(controls[key])||controls[key]<0||controls[key]>255)throw new Error('Consumer cross byte controls required');
 if(controls.processorA===1||controls.processorB===1)throw new Error('Active cross processor not implemented');
 if(groups.length!==3||groups.some(g=>g.length!==64)||auxiliary.some(row=>row.length!==64))throw new Error('Three aligned cross groups and auxiliary rows required');
 return {channels:groups.map(g=>controls.keepGroups&1?Float32Array.from(g):new Float32Array(64)),auxiliary:auxiliary.map(row=>controls.keepAuxiliary&1?Float32Array.from(row):new Float32Array(64))};
}
