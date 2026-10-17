// Independent system-math oracle for the scalar endpoint operations.
// Not a native Pianoteq trajectory or a full source-table implementation.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
static float value(uint32_t w){float x;memcpy(&x,&w,4);return x;}
int main(void){
  uint32_t input[4];
  while(1){
    int n=scanf("%x %x %x %x",input,input+1,input+2,input+3);
    if(n==EOF)return 0;if(n!=4)return 2;
    float a=value(input[0]),b=value(input[1]),t=value(input[2]),db=value(input[3]);
    if(!isfinite(a)||!isfinite(b)||!isfinite(t)||!isfinite(db)||a<0||b<0||t<0||t>1)return 3;
    double s=sin(((double)t*0x1.921fb54442d18p+1)*0.5);
    float w=(float)(s*s),v=1.0f-w,m=fmaf(a,w,b*v),out;
    float u=1.0f-t,floor=expf(db*value(0x3debc8e3));
    float ta=(float)pow((double)t,0.25),tb=(float)pow((double)u,0.25);
    if(db==0)floor=1;
    if(a==0&&b==0)out=0;
    else{
      float p=a==0?b*floor:a,q=b==0?a*floor:b;
      float first=t*logf(p);out=expf(fmaf(u,logf(q),first));
      if(a==0){out=out*tb;if(fabsf(out)<value(0x1e3ce508))out=value(0x1e3ce508);}
      if(b==0){out=out*ta;if(fabsf(out)<value(0x1e3ce508))out=value(0x1e3ce508);}
    }
    float results[4]={w,v,m,out};uint32_t words[4];memcpy(words,results,sizeof words);
    printf("%08x %08x %08x %08x\n",words[0],words[1],words[2],words[3]);
  }
}
