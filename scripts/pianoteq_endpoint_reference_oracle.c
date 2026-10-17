// Independent C/system-fma reference and amplitude-normalization oracle.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
static float value(uint32_t w){float x;memcpy(&x,&w,4);return x;}
static uint32_t bits(float x){uint32_t w;memcpy(&w,&x,4);return w;}
int main(void){
  unsigned n,k,rows;uint32_t wf,wt;
  for(;;){
    int count=scanf("%u %u %u %x %x",&n,&k,&rows,&wf,&wt);
    if(count==EOF)return 0;if(count!=5||n<1||n>8||k<1||k>n||rows>1000)return 2;
    float frequency=value(wf),t=value(wt),offsets[8],ratios[8],frequencies[8000],amplitude[8000];
    if(!(frequency>0)||!isfinite(frequency)||!isfinite(t)||t<0||t>1)return 3;
    for(unsigned i=0;i<n;i++){uint32_t w;if(scanf("%x",&w)!=1)return 4;offsets[i]=value(w);}
    for(unsigned i=0;i<k;i++){uint32_t w;if(scanf("%x",&w)!=1)return 4;ratios[i]=value(w);if(!(ratios[i]>0))return 5;}
    for(unsigned i=0;i<rows*n;i++){uint32_t w;if(scanf("%x",&w)!=1)return 4;frequencies[i]=value(w);}
    for(unsigned i=0;i<rows*n;i++){uint32_t w;if(scanf("%x",&w)!=1)return 4;amplitude[i]=value(w);}
    float sum=0;for(unsigned i=0;i<n;i++)sum=sum+offsets[i];
    float mean=sum/(float)n,coupled=(frequency+mean)/ratios[0];
    float separate=(frequency+offsets[n-1])/ratios[k-1];
    double reference;
    if(t==1)reference=coupled;else if(t==0)reference=separate;
    else{float u=1.0f-t;double product=(double)separate*(double)u;reference=fma((double)coupled,(double)t,product);}
    float target=reference,distance=-1;int index=-1;
    for(unsigned r=0;r<rows;r++){float d=fabsf(frequencies[r*n]-target);if(r==0||d<distance){index=r;distance=d;}}
    float maximum=0,scale=1;
    if(rows){for(unsigned i=0;i<rows*n;i++){float v=fabsf(amplitude[i]);if(maximum<v)maximum=v;}scale=1.0f/maximum;}
    uint64_t wr;memcpy(&wr,&reference,8);
    printf("%016llx %d %08x %08x",(unsigned long long)wr,index,bits(maximum),bits(scale));
    for(unsigned i=0;i<rows*n;i++)printf(" %08x",bits(amplitude[i]*scale));printf("\n");
  }
}
