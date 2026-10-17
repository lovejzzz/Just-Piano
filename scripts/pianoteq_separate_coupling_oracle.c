// Independent scalar C/system-math oracle. No Pianoteq process or model data.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
int main(void){
  unsigned long long words[10];
  for(;;){
    int n=scanf("%llx %llx %llx %llx %llx %llx %llx %llx %llx %llx",words,words+1,words+2,words+3,words+4,words+5,words+6,words+7,words+8,words+9);
    if(n==EOF)return 0;if(n!=10)return 2;
    double x[10];memcpy(x,words,sizeof x);
    for(int i=0;i<10;i++)if(!isfinite(x[i]))return 3;
    const float fundamental=x[2],scale=x[3],mode=x[4],spread=x[5],power=x[6],left=x[7],right=x[8],fraction=x[9];
    if(!(power>0)||fraction<0||fraction>1)return 4;
    double square=(double)mode*(double)mode;
    float center=(float)((x[0]*(double)mode)*sqrt(fma(x[1]+(double)spread,square,1)));
    float logarithm=log10f(power),base=10.0f*logarithm;
    float a=fraction==1?right:left,b=fraction==0?left:right;
    float complement=1.0f-fraction,product=fraction*b;
    float blended=fmaf(a,complement,product),extra=base+blended;
    float output[6]={fundamental,(float)(x[0]*(double)scale),center,extra,logarithm,base};
    uint32_t bits[6];memcpy(bits,output,sizeof bits);
    printf("%08x %08x %08x %08x %08x %08x\n",bits[0],bits[1],bits[2],bits[3],bits[4],bits[5]);
  }
}
