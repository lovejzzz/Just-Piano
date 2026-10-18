import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {filterAuxiliarySymmetric,synthesizeAuxiliaryLevel,auxiliaryWaveletReconstruction} from '../dsp/auxiliary-wavelet-synthesis.mjs';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'piano-synthesis-reference-'));
try {
 const source=String.raw`
#include <stdio.h>
#include <stdint.h>
#include <math.h>
int main(void) {
 uint32_t n,m;if(fread(&n,4,1,stdin)!=1||fread(&m,4,1,stdin)!=1) return 2;
 if(n>4096||m>255||m<3||!(m&1)||n<m) return 3;
 float x[4096],h[255],y[4096];
 if(fread(x,4,n,stdin)!=n||fread(h,4,m,stdin)!=m) return 4;
 for(int i=0;i<n;i++) {
  float sum=0;int j=0;
  for(;j<m;j++) {
   int k=i+(m-1)/2-j;
   if(k<0) k=-k;
   if(k>=n) k=2*(n-1)-k;
   float product=h[j]*x[k];
   if(j==0) sum=product;
   else if(i>0&&m>4&&j<=((m-1)/4)*4) sum=sum+product;
   else sum=fmaf(h[j],x[k],sum);
  }
  y[i]=fabsf(sum)<1e-20f?0:sum;
 }
 return fwrite(y,4,n,stdout)==n?0:5;
}`;
 const c=path.join(temporary,'reference.c'),exe=path.join(temporary,'reference');fs.writeFileSync(c,source);
 const built=spawnSync('clang',['-O2','-ffp-contract=off',c,'-o',exe],{encoding:'utf8'});assert.equal(built.status,0,built.stderr||built.error?.message);
 let seed=42,checked=0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.fround(seed/2**32-.5);};
 for(const m of [3,5,7,9,17,21])for(const n of [m,m+1,4096]){
  const x=Float32Array.from({length:n},random),h=Float32Array.from({length:m},random);
  const input=Buffer.concat([Buffer.from(Uint32Array.of(n,m).buffer),Buffer.from(x.buffer),Buffer.from(h.buffer)]);
  const reference=spawnSync(exe,[],{input,maxBuffer:1048576});assert.equal(reference.status,0,reference.stderr?.toString());
  assert.deepEqual(Buffer.from(filterAuxiliarySymmetric(x,h).buffer),reference.stdout,`N=${n}, taps=${m}`);checked+=n;
 }
 assert.deepEqual(Array.from(filterAuxiliarySymmetric([1,2,4],[1,2,3])),[10,11,16]);
 for(const n of [9,10,31,32]){
  const actual=synthesizeAuxiliaryLevel(new Float32Array(Math.ceil(n/2)).fill(1),new Float32Array(Math.floor(n/2)),n);
  assert.ok(actual.every(v=>v===1));
 }
 assert.throws(()=>filterAuxiliarySymmetric([1,2,3],[1,1]),RangeError);
 assert.throws(()=>filterAuxiliarySymmetric([1,2,3],[1,1,1,1,1]),RangeError);
 assert.throws(()=>synthesizeAuxiliaryLevel([0],[0],9),RangeError);
 const d={integerc:123,scalar28:44100,floats4:[.75,3],vector10:[0,0,0],
  records50:Array.from({length:3},()=>({scalar0:.001,vector20:[1,0],vector8:[1,0],scalar38:2})),floats48:[.02,1]};
 const r=auxiliaryWaveletReconstruction(d);assert.equal(r.frames,882);assert.equal(r.samples.length,882);
 assert.ok(r.samples.every(Number.isFinite));assert.equal(r.fullWaveformImplemented,false);
 console.log(`${checked} symmetric-filter float32 samples match compiled direct-index reference; analytic edges, even/odd synthesis and multilevel extents pass`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
