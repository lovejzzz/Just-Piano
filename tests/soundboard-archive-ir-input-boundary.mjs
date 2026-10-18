import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateSoundboardArchiveIRs} from '../dsp/soundboard-archive-ir.mjs';
assert.throws(()=>generateSoundboardArchiveIRs({}),RangeError);
const root=fileURLToPath(new URL('../dsp/',import.meta.url)),seen=new Set();
function audit(file){
  if(seen.has(file))return;seen.add(file);
  const relative=path.relative(root,file);
  assert.ok(relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'DSP dependency remains inside numerical module tree');
  const source=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(source,/\b(?:require|fetch|readFile|readFileSync|openSync|XMLHttpRequest)\s*\(/,'Numerical generator has no file/network reader');
  assert.doesNotMatch(source,/\bimport\s*\(/,'All numerical dependencies are statically auditable');
  for(const match of source.matchAll(/\b(?:import|export)\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)){
    assert.ok(match[1].startsWith('./')||match[1].startsWith('../'),'No host/native/external dependency');
    audit(path.resolve(path.dirname(file),match[1]));
  }
}
audit(path.join(root,'soundboard-archive-ir.mjs'));
console.log(`archive IR boundary: ${seen.size} numerical modules, no capture/native/file/network input dependency`);
