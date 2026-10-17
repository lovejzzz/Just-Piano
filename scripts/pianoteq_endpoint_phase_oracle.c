// ARM wrap instruction oracle plus independent phase state/linear mixing.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
extern float phase_wrap_scalar(float);
extern void phase_wrap_vector(const float*,float*);
int main(void){
  uint32_t words[5];
  for(;;){
    int n=scanf("%x %x %x %x %x",words,words+1,words+2,words+3,words+4);
    if(n==EOF)return 0;if(n!=5)return 2;
    float x[5];memcpy(x,words,sizeof x);
    for(int i=0;i<5;i++)if(!isfinite(x[i]))return 3;
    if(x[2]<0||x[2]>1||x[3]<0||x[4]<0)return 4;
    float vectorInput[4]={x[0],x[1],-x[0],-x[1]},v[4];phase_wrap_vector(vectorInput,v);
    float a=phase_wrap_scalar(x[0]),b=phase_wrap_scalar(x[1]);
    uint32_t type=(x[3]==0?1:0)+(x[4]==0?2:0);
    float left=a,right=b;
    if(type==1)left=right;else if(type==2)right=left;else if(type==3)left=right=0;
    float u=1.0f-x[2],product=u*right;
    float out=phase_wrap_scalar(fmaf(x[2],left,product));
    float values[7]={a,b,out,v[0],v[1],v[2],v[3]};uint32_t results[7];memcpy(results,values,sizeof values);
    printf("%08x %08x %08x %08x %08x %08x %08x %u\n",results[0],results[1],results[2],results[3],results[4],results[5],results[6],type);
  }
}
