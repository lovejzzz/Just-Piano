// Independent system scalar math/FMA and standalone ARM coordinate oracle.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
extern uint32_t source_phase_unsigned(float);
extern float source_phase_roundtrip(float);
int main(void){
  unsigned columns;unsigned long long wc;
  for(;;){
    int count=scanf("%u %llx",&columns,&wc);
    if(count==EOF)return 0;if(count!=2||columns<1||columns>8)return 2;
    double constant;memcpy(&constant,&wc,8);if(!isfinite(constant))return 3;
    float x[7],frequency[8],phase[8];
    for(unsigned i=0;i<7;i++){uint32_t w;if(scanf("%x",&w)!=1)return 4;memcpy(x+i,&w,4);}
    for(unsigned i=0;i<columns;i++){uint32_t w;if(scanf("%x",&w)!=1)return 4;memcpy(frequency+i,&w,4);}
    for(unsigned i=0;i<columns;i++){uint32_t w;if(scanf("%x",&w)!=1)return 4;memcpy(phase+i,&w,4);}
    float coordinate=x[0],global=x[1],even=x[2],oddDegrees=x[3],evenDegrees=x[4],oddDelay=x[5],evenDelay=x[6];
    uint32_t integer=source_phase_unsigned(coordinate),eligible=source_phase_roundtrip(coordinate)==coordinate;
    double degrees=constant/180.0,twice=constant+constant;
    if(global!=0){float delta=degrees*(double)global;for(unsigned i=0;i<columns;i++)phase[i]=phase[i]+delta;}
    if(eligible){
      if(!(integer&1))for(unsigned i=0;i<columns;i++)phase[i]=even+phase[i];
      if(columns>1){
        float angle=integer&1?oddDegrees:evenDegrees,delay=integer&1?oddDelay:evenDelay;
        if(angle!=0||delay!=0){
          float degreePart=degrees*(double)angle,delayPart=twice*(double)delay;
          float correction=fmaf(-frequency[1],delayPart,degreePart);phase[1]=correction+phase[1];
        }
      }
    }
    printf("%u %u",integer,eligible);
    for(unsigned i=0;i<columns;i++){uint32_t w;memcpy(&w,phase+i,4);printf(" %08x",w);}printf("\n");
  }
}
