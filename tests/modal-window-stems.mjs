// Synthetic integrity checks for export gates; not authentic sound-quality evidence.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'modal-window-stems-'));
const group=()=>Array.from({length:64},(_,i)=>i===0?.25:0);
const d={runStatus:{terminal:true,exitStatus:0},errors:[],complete:true,records:[{stage:'weights',selectionSource:{sampleRate:48000}},{stage:'coefficients',epoch:0,counter:64,actual:{gain:1}},...[0,64].map(counter=>({stage:'copy',epoch:0,counter,render:{channels:[group(),group(),group()]}}))]};
const r={passed:true,boundedWindow:true,workerOutputs:false,continuousModalStatesCarried:true,dampingControlsFromArchive:true,positionAndRolloffControlsObserved:false,initialPositionWeightsObserved:false,initialPositionWeightsComputed:true,finalVoiceStates:[{epoch:0,positionWeightsReady:true,positionWeightWarmupBlocks:1}],dampingModels:[{epoch:0,position:.1,extraCurve:{x:[],y:[1]}}],windowEnd:128,windowBlocks:2,continuousOutputSamples:384,continuousOutputs:[0,64].map(counter=>({counter,channels:[group(),group(),group()]}))};
const capture=path.join(root,'runtime.json'),report=path.join(root,'report.json');
function save(){const bytes=Buffer.from(JSON.stringify(d));fs.writeFileSync(capture,bytes);r.captureSha256=crypto.createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(report,JSON.stringify(r));}
function run(name){const dest=path.join(root,name),result=spawnSync(process.execPath,[new URL('../scripts/pianoteq_write_modal_window_stems.mjs',import.meta.url).pathname,capture,report,dest],{encoding:'utf8'});return {dest,...result};}
try{
 fs.writeFileSync(path.join(root,'lldb.log'),'');save();let result=run('ok');assert.equal(result.status,0,result.stderr);const wav=fs.readFileSync(path.join(result.dest,'voice-0-window-group-0.wav'));assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(54),128*4);assert.equal(wav.readFloatLE(58),.25);
 d.records[1].actual.gain=0;save();result=run('inactive-window');assert.notEqual(result.status,0);assert.match(result.stderr,/nonzero position-weight gain/);assert.equal(fs.existsSync(result.dest),false);d.records[1].actual.gain=1;
 r.continuousOutputs[0].channels[0][0]=.5;save();result=run('bad-pcm');assert.notEqual(result.status,0);assert.match(result.stderr,/PCM differs/);assert.equal(fs.existsSync(result.dest),false);
 r.continuousOutputs[0].channels[0][0]=.25;save();fs.writeFileSync(path.join(root,'lldb.log'),'Could not read fixture.fxp: corrupt FXP file');result=run('bad-load');assert.notEqual(result.status,0);assert.equal(fs.existsSync(result.dest),false);
 fs.writeFileSync(path.join(root,'lldb.log'),'');r.captureSha256='invalid';fs.writeFileSync(report,JSON.stringify(r));result=run('unbound');assert.notEqual(result.status,0);assert.equal(fs.existsSync(result.dest),false);
 save();const forbidden=new URL('../forbidden-audio-output',import.meta.url).pathname;result=spawnSync(process.execPath,[new URL('../scripts/pianoteq_write_modal_window_stems.mjs',import.meta.url).pathname,capture,report,forbidden],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/outside repository/);assert.equal(fs.existsSync(forbidden),false);
 console.log('modal window stem integrity: passed');
}finally{fs.rmSync(root,{recursive:true,force:true});}
