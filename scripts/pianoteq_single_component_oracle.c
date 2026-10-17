// Independent compiler runtime complex division and scalar fast-path arithmetic.
// This is not a Pianoteq process or a native voice capture.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <complex.h>
extern double _Complex __divdc3(double,double,double,double);
int main(void){
  uint64_t words[4];
  for(;;){
    int n=scanf("%llx %llx %llx %llx",(unsigned long long*)words,(unsigned long long*)(words+1),(unsigned long long*)(words+2),(unsigned long long*)(words+3));
    if(n==EOF)return 0;if(n!=4)return 2;
    double x[4];memcpy(x,words,sizeof x);
    for(int i=0;i<4;i++)if(!isfinite(x[i]))return 3;
    if(x[0]==0&&x[1]==0)return 4;
    double _Complex z=__divdc3(1,0,x[0],x[1]);
    double re=creal(z),im=cimag(z);float frequency=(float)fma(x[2]/-0x1.921fb54442d18p+1,im,x[3]),decay=(float)((x[2]+x[2])*re);
    uint64_t rb,ib;uint32_t fb,db;memcpy(&rb,&re,8);memcpy(&ib,&im,8);memcpy(&fb,&frequency,4);memcpy(&db,&decay,4);
    printf("%016llx %016llx %08x %08x\n",(unsigned long long)rb,(unsigned long long)ib,fb,db);
  }
}
