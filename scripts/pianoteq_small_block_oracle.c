// Independent C/runtime oracle for finite complex division and 2x2 extraction.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <complex.h>
extern double _Complex __divdc3(double,double,double,double);
static double readnumber(void){unsigned long long w;if(scanf("%llx",&w)!=1)return NAN;double x;memcpy(&x,&w,8);return x;}
static void word(double x){uint64_t w;memcpy(&w,&x,8);printf("%016llx ",(unsigned long long)w);}
static void product(double ar,double ai,double br,double bi,double *r,double *i){*r=fma(ar,br,-(ai*bi));*i=fma(ai,br,ar*bi);}
static void root(double r,double i,double *x,double *y){if(r==0){*x=sqrt((i>=0?i:-i)*.5);*y=i>=0?*x:-*x;}else{double m=sqrt(fma(r,r,i*i)),t=sqrt(((r>=0?r:-r)+m)*2),h=t*.5;if(r>0){*x=h;*y=i/t;}else{*x=(i>=0?i:-i)/t;*y=i>=0?h:-h;}}}
int main(void){char op;while(scanf(" %c",&op)==1){
 if(op=='d'){double a=readnumber(),b=readnumber(),c=readnumber(),d=readnumber();double _Complex z=__divdc3(a,b,c,d);word(creal(z));word(cimag(z));}
 else if(op=='e'){double ar=readnumber(),ai=readnumber(),cr=readnumber(),ci=readnumber(),br=readnumber(),bi=readnumber(),dr=readnumber(),di=readnumber(),tol=readnumber();
 double sub=sqrt(fma(cr,cr,ci*ci)),an=sqrt(fma(ar,ar,ai*ai)),dn=sqrt(dr*dr+di*di),threshold=(tol+tol)*(an+dn);
 if(sub<threshold){word(ar);word(ai);word(dr);word(di);}else{double pr,pi,qr,qi;product(ar,ai,dr,di,&pr,&pi);product(br,bi,cr,ci,&qr,&qi);double tr=ar+dr,ti=ai+di;
 double rr=fma(-(pr-qr),4,fma(tr,tr,-(ti*ti))),ri=fma(-(pi-qi),4,(tr*ti)+(tr*ti)),x,y;root(rr,ri,&x,&y);word((tr+x)*.5);word((ti+y)*.5);root(rr,ri,&x,&y);word((tr-x)*.5);word((ti-y)*.5);}}
 else return 2;putchar('\n');}return 0;}
