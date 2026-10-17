// Independent scalar C transcription of grid row accumulation (synthetic inputs).
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
static uint32_t state=0x75938a1b;
static uint32_t rng(void){state^=state<<13;state^=state>>17;return state^=state<<5;}
static float value(void){return (float)(int32_t)rng()/1048576.0f;}
static void floats(float *v,int n){putchar('[');for(int i=0;i<n;i++)printf("%s%.9g",i?",":"",v[i]);putchar(']');}
int main(int argc,char**argv){int cases=argc>1?atoi(argv[1]):1000;
 for(int c=0;c<cases;c++){
  float rows[3][40],initial[40]={0},out[40]={0};int n[3],m=rng()%8;
  for(int j=0;j<3;j++){n[j]=rng()%39;for(int i=0;i<n[j];i++)rows[j][i]=value();}
  for(int i=0;i<m;i++)initial[i]=out[i]=value();
  float notes[]={0,10,15.25f,20,25.75f,30,40};float note=notes[c%7];int count=m,left,right;float alpha=0;
  if(note<10){left=right=0;}else if(note>=30){left=right=2;}else{left=note>20?1:0;right=left+1;alpha=(note-(10+left*10))/10;}
  int ids[]={left,right};for(int k=0;k<(left==right?1:2);k++){int j=ids[k];if(n[j]>count)count=n[j];float scale=k?alpha:1-alpha;
   for(int i=0;i<n[j];i++)out[i]=left==right?out[i]+rows[j][i]:fmaf(scale,rows[j][i],out[i]);}
  printf("{\"note\":%.9g,\"rows\":[",note);for(int j=0;j<3;j++){if(j)putchar(',');floats(rows[j],n[j]);}printf("],\"initial\":");floats(initial,m);printf(",\"expectedBits\":[");
  for(int i=0;i<count;i++){uint32_t word;memcpy(&word,&out[i],4);printf("%s%u",i?",":"",word);}printf("]}\n");
 }
}
