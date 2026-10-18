import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {designAuxiliaryEQ,equalizeAuxiliaryWavelet} from '../dsp/auxiliary-wavelet-eq.mjs';
import {shapeAuxiliaryWaveform} from '../dsp/auxiliary-waveform-shaping.mjs';
import {generateAuxiliaryBank} from '../dsp/auxiliary-generated-bank.mjs';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'piano-final-stages-'));
try{
 const source=String.raw`
#include <stdio.h>
#include <math.h>
int main(int argc,char **argv){
 const double pi=3.141592653589793;
 if(argc!=2)return 2;
 if(argv[1][0]=='e'){
  float p[5];while(fread(p,4,5,stdin)==5){
   float frequency=fminf(p[0],(float)((double)p[3]/2.001));
   float normalized=fmaxf(3e-5f,fminf(.99997f,frequency/(p[3]*.5f)));
   float angle=(float)((double)normalized*pi),A=expf((p[1]/40.0f)*2.3025851f);
   float alpha=sinf(angle)/(p[2]+p[2]),c=cosf(angle);
   float b0,b1,b2,a0,a1,a2,gain=1;
   int type=p[4];
   if(type==1){float z=A*alpha,v=alpha/A;b0=z+1;b1=c*-2;b2=1-z;a0=v+1;a1=b1;a2=1-v;}
   else if(type==4){b1=1-c;b0=b1*.5f;b2=b0;a0=alpha+1;a1=c*-2;a2=1-alpha;gain=A*A;}
   else{float sum=A+1,difference=A-1,product=difference*c,root=sqrtf(A),spread=(root+root)*alpha;
    if(type==2){float z=sum-product,z2=sum+product;b0=A*(z+spread);b1=(A+A)*(difference-sum*c);b2=A*(z-spread);a0=z2+spread;a1=(difference+sum*c)*-2;a2=z2-spread;}
    else{float z=sum+product,z2=sum-product;b0=A*(z+spread);b1=(A*-2)*(difference+sum*c);b2=A*(z-spread);a0=z2+spread;a1=(difference-sum*c)*2;a2=z2-spread;}
   }
   float invB=1/b0,invA=1/a0,result[5]={invA*(gain*b0),b1*invB,b2*invB,-(a1*invA),-(invA*a2)};
   if(fwrite(result,4,5,stdout)!=5)return 3;
  }
 }else{
  float p[3],x[100000];if(fread(p,4,3,stdin)!=3)return 4;int n=p[2];
  if(n<1||n>100000||fread(x,4,n,stdin)!=n)return 5;
  int leading=fminf(n,ceilf(p[0]*.0005f)),trailing=fminf(n,ceilf(p[0]*.01f));
  for(int side=0;side<2;side++){int count=side?trailing:leading;double divisor=(float)(count*2);
   for(int i=0;i<count;i++){double s=sin(((i+1)*pi)/divisor);int j=side?n-1-i:i;x[j]=(float)((s*s)*(double)x[j]);}}
  float peak=0;for(int i=0;i<n;i++)peak=fmaxf(peak,fabsf(x[i]));float scale=p[1]/peak;
  for(int i=0;i<n;i++)x[i]=x[i]*scale;
  if(fwrite(x,4,n,stdout)!=n)return 6;
 }
 return 0;
}`;
 const c=path.join(temporary,'reference.c'),exe=path.join(temporary,'reference');fs.writeFileSync(c,source);
 const built=spawnSync('clang',['-O2','-ffp-contract=off',c,'-o',exe],{encoding:'utf8'});assert.equal(built.status,0,built.stderr||built.error?.message);
 const cases=[];for(const rate of [44100,48000])for(const type of [1,2,3,4])for(const frequency of [20,440,6000,30000])for(const decibels of [-12,0,6])cases.push([frequency,decibels,.7071,rate,type]);
 const input=Float32Array.from(cases.flat()),reference=spawnSync(exe,['e'],{input:Buffer.from(input.buffer)});assert.equal(reference.status,0);
 const actual=Float32Array.from(cases.flatMap(([frequency,db,q,rate,type])=>{const s=designAuxiliaryEQ(frequency,db,q,type,rate);return [s.gain,...s.coefficients];}));
 assert.deepEqual(Buffer.from(actual.buffer),reference.stdout);
 for(const [n,rate] of [[16,48000],[88200,44100],[128,192000]]){
  const x=Float32Array.from({length:n},(_,i)=>Math.fround((i%17-8)/9));
  const result=spawnSync(exe,['w'],{input:Buffer.concat([Buffer.from(Float32Array.of(rate,.75,n).buffer),Buffer.from(x.buffer)]),maxBuffer:1048576});assert.equal(result.status,0);
  assert.deepEqual(Buffer.from(shapeAuxiliaryWaveform(x,rate,.75).samples.buffer),result.stdout);
 }
 assert.equal(shapeAuxiliaryWaveform(new Float32Array(128).fill(1),48000,1).leading,25);
 assert.throws(()=>shapeAuxiliaryWaveform([0,0,0],44100,1),RangeError);
 assert.deepEqual(equalizeAuxiliaryWavelet([1,2,3],[],44100),Float32Array.of(1,2,3));
 assert.throws(()=>equalizeAuxiliaryWavelet([1,2,3],[440,0,1,1],44100),RangeError);
 assert.throws(()=>designAuxiliaryEQ(440,0,1,12,44100),RangeError);
 const descriptor={integer0:60,integerc:123,scalar28:44100,floats4:[.75,3],vector10:[0,0],vector30:[],
  records50:Array.from({length:2},()=>({scalar0:.001,vector20:[1,0],vector8:[1,0],scalar38:2})),floats48:[.02,1]};
 const group={version:1,integer20:1,vector28:[60],sub0:{version:2,integer18:2,records:[descriptor]}};
 const bank=generateAuxiliaryBank(group);assert.equal(bank.size,2);
 assert.notDeepEqual(bank.get('kind1:key60:variant0').samples,bank.get('kind1:key60:variant1').samples);
 assert.throws(()=>generateAuxiliaryBank({...group,vector28:[61]}),RangeError);
 assert.throws(()=>generateAuxiliaryBank(group,44100),RangeError);
 assert.throws(()=>generateAuxiliaryBank({...group,sub0:{...group.sub0,records:[{...descriptor,integerc:NaN}]}}),RangeError);
 console.log(`${cases.length*5} EQ coefficient words and 88344 shaped samples match compiled references; ceil windows, independent variants and unsupported branches pass`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
