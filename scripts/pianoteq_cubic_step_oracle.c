// Independent C/CRT arithmetic for ordinary and exceptional cubic QR steps.
// Synthetic matrices only; does not load or run Pianoteq.
#define PIANOTEQ_REFLECTOR_ORACLE_NO_MAIN
#include "pianoteq_reflector_update_oracle.c"
static double mag(double r,double i){return sqrt(fma(r,r,i*i));}
int main(void){int special;while(scanf("%d",&special)==1){
 double a[18],v[6],tail[4],w[6],sr,si,tr,ti,pr,pi;
 for(int i=0;i<18;i++)a[i]=readnumber();
 sr=a[16];si=a[17];tr=a[8];ti=a[9];
 if(special){double scale=mag(a[10],a[11])+mag(a[2],a[3]);sr=tr=scale*.75;si=ti=0;pr=scale*(scale*-.4375);pi=0;}
 else times(a[10],a[11],a[14],a[15],&pr,&pi);
 double ur=tr-a[0],ui=ti-a[1],vr=sr-a[0],vi=si-a[1];
 double xr=fma(ur,vr,-(ui*vi))-pr,xi=fma(vr,ui,ur*vi)-pi;
 double _Complex quotient=__divdc3(xr,xi,a[2],a[3]);xr=a[6]+creal(quotient);xi=a[7]+cimag(quotient);
 double yr=((a[8]-a[0])-ur)-vr,yi=((a[9]-a[1])-ui)-vi;
 double scale=(mag(yr,yi)+mag(xr,xi))+sqrt(fma(a[11],a[11],a[10]*a[10]));
 v[0]=xr/scale;v[1]=xi/scale;v[2]=yr/scale;v[3]=yi/scale;v[4]=a[10]/scale;v[5]=a[11]/scale;
 printf("ok ");for(int i=0;i<6;i++)word(v[i]);householder(v,3);for(int i=0;i<6;i++)word(v[i]);
 reflect(a,3,3,0,3,0,3,v,1,w);reflect(a,3,3,0,3,0,3,v,0,w);
 memcpy(tail,a+2,sizeof(tail));householder(tail,2);for(int i=0;i<4;i++)word(tail[i]);
 reflect(a,3,3,1,3,0,3,tail,1,w);reflect(a,3,3,0,3,1,3,tail,0,w);
 for(int i=0;i<18;i++)word(a[i]);putchar('\n');
 }return 0;}
