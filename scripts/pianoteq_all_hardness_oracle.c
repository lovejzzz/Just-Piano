// Driver for a standalone arithmetic transcription, not native voice sampling.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
extern void all_hardness_instruction_oracle(const float *,float *);
int main(void){
  uint32_t words[4];
  for(;;){
    int n=scanf("%x %x %x %x",words,words+1,words+2,words+3);
    if(n==EOF)return 0;
    if(n!=4)return 2;
    float input[4],output[3];memcpy(input,words,sizeof input);
    for(int i=0;i<4;i++)if(!isfinite(input[i]))return 3;
    all_hardness_instruction_oracle(input,output);
    uint32_t bits[3];memcpy(bits,output,sizeof bits);
    printf("%08x %08x %08x\n",bits[0],bits[1],bits[2]);
  }
}
