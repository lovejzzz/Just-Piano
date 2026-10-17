import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readCapture,writeCapture} from '../scripts/pianoteq_capture_jsonl.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'piano-capture-jsonl-'));
try{
 const value={schema:1,complete:true,configs:{unicode:'琴弦\n"\\',negativeZero:-0,scalars:[1e-30,1.2345678901234567]},records:[{stage:'source',values:[-0,0,Math.fround(.1)],text:'\r\n'},{stage:'target',nested:{a:[1,2,{b:'音'}]}}]};
 const file=path.join(dir,'capture.jsonl');writeCapture(file,value);assert.deepEqual(await readCapture(file),value);assert.throws(()=>writeCapture(file,value));
 const lines=fs.readFileSync(file,'utf8').trimEnd().split('\n');
 const missing=path.join(dir,'missing.jsonl');fs.writeFileSync(missing,lines.slice(0,-1).join('\n')+'\n');await assert.rejects(readCapture(missing),/Incomplete/);
 const extra=path.join(dir,'extra.jsonl');fs.writeFileSync(extra,lines.concat(lines[1]).join('\n')+'\n');await assert.rejects(readCapture(extra),/Incomplete/);
 const malformed=path.join(dir,'malformed.jsonl');fs.writeFileSync(malformed,'{"format":"unknown"}\n');await assert.rejects(readCapture(malformed),/header/);
 console.log('PASS: capture JSONL preserves fields, float64, signed zero and Unicode; truncation/extra records/format/overwrite rejected');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
