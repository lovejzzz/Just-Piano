// Independent C/system-fmaf component assembly and weight-selection oracle.
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
static float value(uint32_t w){float x;memcpy(&x,&w,4);return x;}
static int readf(float* x){uint32_t w;if(scanf("%x",&w)!=1)return 0;*x=value(w);return isfinite(*x);}
static void writef(float x){uint32_t w;memcpy(&w,&x,4);printf(" %08x",w);}
int main(void){
  unsigned n,scalesCount,limit,weightCount,ratioCount;
  for(;;){
    int status=scanf("%u %u %u %u %u",&n,&scalesCount,&limit,&weightCount,&ratioCount);
    if(status==EOF)return 0;if(status!=5||n<1||n>8||scalesCount<1||scalesCount>8||limit>128||weightCount>128||ratioCount<1||ratioCount>8)return 2;
    float scales[8],weights[128],ratios[8],source[8][4][128];unsigned counts[8],rows=0;
    for(unsigned i=0;i<scalesCount;i++)if(!readf(scales+i))return 3;
    for(unsigned i=0;i<weightCount;i++)if(!readf(weights+i))return 3;
    for(unsigned i=0;i<ratioCount;i++)if(!readf(ratios+i))return 3;
    for(unsigned c=0;c<n;c++){
      if(scanf("%u",counts+c)!=1||counts[c]>limit)return 4;
      if(rows<counts[c])rows=counts[c];
      for(unsigned k=0;k<4;k++)for(unsigned r=0;r<counts[c];r++)if(!readf(&source[c][k][r]))return 3;
    }
    float* out[4];for(unsigned k=0;k<4;k++)out[k]=calloc(rows*n?rows*n:1,sizeof(float));
    for(unsigned c=0;c<n;c++){
      float scale=scales[c<scalesCount?c:scalesCount-1];
      for(unsigned r=0;r<counts[c];r++){
        for(unsigned k=0;k<4;k++)out[k][r*n+c]=source[c][k][r];
        out[2][r*n+c]=out[2][r*n+c]*scale;
      }
      unsigned last=0,previousZero=0;
      for(unsigned r=0;r<rows;r++){
        unsigned i=r*n+c,zero=out[0][i]==0;
        if(zero){
          float delta=(float)(r-last);
          out[0][i]=fmaf(out[0][c],delta,out[0][last*n+c]);
          out[1][i]=out[1][last*n+c]+delta;out[2][i]=value(0x1e3ce508);
        }else{if(previousZero)return 5;last=r;}
        previousZero=zero;
      }
    }
    if(ratioCount==2&&ratios[0]==.5f&&ratios[1]==.5f&&weightCount)
      for(unsigned i=0;i<weightCount;i++){unsigned index=2*i+1;if(index>=weightCount)index=weightCount-1;weights[i]=weights[index];}
    printf("%u %u %u",rows,n,weightCount);
    for(unsigned i=0;i<weightCount;i++)writef(weights[i]);
    for(unsigned k=0;k<4;k++)for(unsigned i=0;i<rows*n;i++)writef(out[k][i]);printf("\n");
    for(unsigned k=0;k<4;k++)free(out[k]);
  }
}
