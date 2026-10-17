import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nativeDoubleExp} from '../dsp/native-double-exp.mjs';
const v=new DataView(new ArrayBuffer(8)),number=hex=>{v.setBigUint64(0,BigInt('0x'+hex));return v.getFloat64(0);},bits=value=>{v.setFloat64(0,value);return v.getBigUint64(0).toString(16).padStart(16,'0');};
// Independent system-libm words from deterministic synthetic seed 124.
for(const [input,expected]of [['c04e50f5e5240000','3a77091681582e57'],['408323097ebf7c00','77264541e14925c3'],['c08628c0867f8800','0007f6ece470e865'],['407ccbe1547d2614','697a309bec4a2bdd']])assert.equal(bits(nativeDoubleExp(number(input))),expected);
assert.equal(nativeDoubleExp(0),1);assert.equal(nativeDoubleExp(-0),1);assert.equal(nativeDoubleExp(Number.MIN_VALUE),1);assert.equal(nativeDoubleExp(-Number.MIN_VALUE),1);
assert.equal(nativeDoubleExp(Infinity),Infinity);assert.equal(nativeDoubleExp(-Infinity),0);assert.equal(nativeDoubleExp(1e308),Infinity);assert.equal(nativeDoubleExp(-1e308),0);assert(Number.isNaN(nativeDoubleExp(NaN)));
assert.equal(nativeDoubleExp(number('40862e42fefa39f0')),Infinity);assert.equal(nativeDoubleExp(number('c0874a0000000000')),0);assert.throws(()=>nativeDoubleExp('1'),/Binary64/);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'piano-exp-mode-'));
try{
 const report=path.join(directory,'report.json'),script=fileURLToPath(new URL('../scripts/pianoteq_replay_fixed_shared_stereo.mjs',import.meta.url));
 const run=spawnSync(process.execPath,[script,path.join(directory,'absent-capture'),path.join(directory,'absent-audit'),report,'--exp-candidate','--native-double-exp'],{encoding:'utf8'});
 assert.equal(run.status,1);assert(run.stderr.includes('Select exactly one exponential implementation'));assert(!fs.existsSync(report));
}finally{fs.rmSync(directory,{recursive:true,force:true});}
console.log('PASS: native double exp synthetic bit fixtures, subnormal rounding, signed zero, range limits and special-value semantics');
