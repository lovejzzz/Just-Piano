import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {filterAuxiliaryAR} from '../dsp/auxiliary-ar-filter.mjs';
import {fma32} from '../dsp/modal-kernel.mjs';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'piano-ar-reference-'));
try {
 // Hardware float/fmaf oracle, with compiler contraction explicitly disabled.
 const source=String.raw`
#include <stdio.h>
#include <stdint.h>
#include <math.h>
int main(void) {
 uint32_t n, nb, na;
 if(fread(&n,4,1,stdin)!=1||fread(&nb,4,1,stdin)!=1||fread(&na,4,1,stdin)!=1) return 2;
 if(n>4096||nb<2||nb>256||na<2||na>256) return 3;
 float x[4096], b[256], a[256], y[4096];
 if(fread(x,4,n,stdin)!=n||fread(b,4,nb,stdin)!=nb||fread(a,4,na,stdin)!=na) return 4;
 uint32_t prefix=nb>na?nb:na;
 float inverse=1.0f/a[0];
 for(uint32_t i=0;i<n;i++) {
  float accumulator=b[0]*x[i]; uint32_t k=1;
  if(i>=prefix&&nb>4) {
   for(;k+3<nb;k+=4) {
    float p[4]; for(int lane=0;lane<4;lane++) p[lane]=b[k+lane]*x[i-k-lane];
    for(int lane=0;lane<4;lane++) accumulator=accumulator+p[lane];
   }
  }
  for(;k<nb&&k<=i;k++) accumulator=fmaf(b[k],x[i-k],accumulator);
  for(k=1;k<na&&k<=i;k++) accumulator=fmaf(-a[k],y[i-k],accumulator);
  if(fabsf(accumulator)<1e-20f) accumulator=0;
  y[i]=inverse*accumulator;
 }
 return fwrite(y,4,n,stdout)==n?0:5;
}`;
 const c=path.join(temporary,'reference.c'),exe=path.join(temporary,'reference');fs.writeFileSync(c,source);
 const compiled=spawnSync('clang',['-O2','-ffp-contract=off',c,'-o',exe],{encoding:'utf8'});
 assert.equal(compiled.status,0,compiled.stderr||compiled.error?.message);
 let word=56789;
 const random=()=>{word=(Math.imul(word,1664525)+1013904223)>>>0;return Math.fround((word/2**32-.5)*.2);};
 let checked=0;
 for(const [nb,na] of [[2,2],[4,3],[5,3],[6,4],[17,21],[21,21],[22,21]]){
  const x=Float32Array.from({length:4096},random),b=Float32Array.from({length:nb},random);
  const a=Float32Array.from({length:na},()=>random()/na);a[0]=1.25;
  const input=Buffer.concat([Buffer.from(Uint32Array.of(x.length,nb,na).buffer),Buffer.from(x.buffer),Buffer.from(b.buffer),Buffer.from(a.buffer)]);
  const reference=spawnSync(exe,[],{input,maxBuffer:1048576});assert.equal(reference.status,0,reference.stderr?.toString());
  const actual=filterAuxiliaryAR(x,b,a);
  assert.deepEqual(Buffer.from(actual.buffer),reference.stdout,`hardware AR mismatch, numerator ${nb}, denominator ${na}`);checked+=x.length;
  if(nb===21&&na===21){
   // A plausible all-fused implementation must fail after the prefix. Keep
   // this check so removing the body rounding boundary cannot silently pass.
   const fused=new Float32Array(x.length),inverse=Math.fround(1/a[0]);
   for(let i=0;i<x.length;i++){
    let sum=Math.fround(b[0]*x[i]);
    for(let k=1;k<b.length&&k<=i;k++)sum=fma32(b[k],x[i-k],sum);
    for(let k=1;k<a.length&&k<=i;k++)sum=fma32(-a[k],fused[i-k],sum);
    fused[i]=Math.fround(inverse*(Math.abs(sum)<Math.fround(1e-20)?0:sum));
   }
   assert.deepEqual(fused.slice(0,21),actual.slice(0,21));
   assert.notDeepEqual(fused.slice(21),actual.slice(21));
  }
 }
 const impulse=filterAuxiliaryAR([1,0,0,0,0],[1,0],[1,-.5]);
 assert.deepEqual(Array.from(impulse),[1,.5,.25,.125,.0625]);
 assert.equal(filterAuxiliaryAR([1e-22],[1,0],[1,0])[0],0);
 assert.equal(filterAuxiliaryAR([Math.fround(1e-20)],[1,0],[1,0])[0],Math.fround(1e-20));
 assert.equal(filterAuxiliaryAR([],[1,0],[1,0]).length,0);
 assert.throws(()=>filterAuxiliaryAR([0],[1,0],[0,1]),RangeError);
 assert.throws(()=>filterAuxiliaryAR([NaN],[1,0],[1,0]),RangeError);
 assert.throws(()=>filterAuxiliaryAR([0],[1],[1,0]),RangeError);
 console.log(`${checked} float32 samples exactly match compiled fmaf reference; impulse, flush boundary and invalid inputs pass`);
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
