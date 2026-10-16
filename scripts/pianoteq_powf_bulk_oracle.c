// Independent system powf oracle; contains no analysis-target code or data.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void){
 uint32_t a,b;while(scanf("%x %x",&a,&b)==2){float x,y,z;memcpy(&x,&a,4);memcpy(&y,&b,4);z=powf(x,y);uint32_t r;memcpy(&r,&z,4);printf("%08x\n",r);}return 0;
}
