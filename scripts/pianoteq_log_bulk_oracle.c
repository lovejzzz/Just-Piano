// Independent system log / log2f calibration; no analysis-target attachment.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(int argc,char **argv){if(argc!=2||(strcmp(argv[1],"log")&&strcmp(argv[1],"log2f")))return 2;unsigned long long input;while(scanf("%llx",&input)==1){uint64_t bits=(uint64_t)input;double x,y;memcpy(&x,&bits,8);y=!strcmp(argv[1],"log")?log(x):log2f((float)x);memcpy(&bits,&y,8);printf("%016llx\n",(unsigned long long)bits);}return 0;}
