export class TailInputQueue512 {
 constructor(){this.position=0;this.completed=0;this.rows=Array.from({length:9},()=>new Float32Array(512));}
 write(source){
  if(source.length!==9||source.some(row=>row.length!==64))throw new Error('Nine 64-frame queue inputs required');
  const position=this.position;
  for(let row=0;row<9;row++)this.rows[row].set(source[row],position);
  const written=this.rows.map(row=>row.slice(position,position+64));
  this.position+=64;let completedChunk=null;
  if(this.position===512){this.position=0;this.completed++;completedChunk=this.rows.map(row=>row.slice());}
  return {position,written,completedChunk};
 }
}
export function addQueuedTail64(head,tail){
 if(head.length!==3||tail.length!==3||[...head,...tail].some(row=>row.length!==64))throw new Error('Three 64-frame tail/output rows required');
 return head.map((row,j)=>Float32Array.from(row,(x,i)=>Math.fround(x+tail[j][i])));
}
