// Public system exp(double) calibration, without target code/data or attachment.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void){uint64_t bits;while(scanf("%llx",(unsigned long long*)&bits)==1){double x,y;memcpy(&x,&bits,8);y=exp(x);memcpy(&bits,&y,8);printf("%016llx\n",(unsigned long long)bits);}return 0;}
