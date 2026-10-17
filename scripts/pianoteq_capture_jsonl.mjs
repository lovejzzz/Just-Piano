// Preserve every capture field while avoiding V8's single-string size limit.
import fs from 'node:fs';
import readline from 'node:readline';
import {stringifyWithNegativeZero} from './pianoteq_json_exact.mjs';
export async function readCapture(path){
 if(!path.endsWith('.jsonl'))return JSON.parse(fs.readFileSync(path,'utf8'));
 const lines=readline.createInterface({input:fs.createReadStream(path),crlfDelay:Infinity});let data,count=0,expected;
 for await(const line of lines){
  if(!line.length)throw new Error('Empty capture line');
  const value=JSON.parse(line);
  if(!data){if(value.format!=='pianoteq-capture-jsonl-v1'||!Number.isInteger(value.recordCount)||value.recordCount<0||!value.metadata||'records'in value.metadata)throw new Error('Capture JSONL header required');data={...value.metadata,records:[]};expected=value.recordCount;}
  else{data.records.push(value);count++;}
 }
 if(!data||count!==expected)throw new Error('Incomplete capture JSONL records');return data;
}
export function writeCapture(path,data){
 const {records,...metadata}=data;if(!Array.isArray(records))throw new Error('Capture records required');
 const fd=fs.openSync(path,'wx');
 try{fs.writeSync(fd,stringifyWithNegativeZero({format:'pianoteq-capture-jsonl-v1',recordCount:records.length,metadata})+'\n');for(const r of records)fs.writeSync(fd,stringifyWithNegativeZero(r)+'\n');}finally{fs.closeSync(fd);}
}
