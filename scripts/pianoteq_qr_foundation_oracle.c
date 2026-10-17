// Standalone instruction-order C oracle; no proprietary executable is loaded.
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <complex.h>
extern double _Complex __divdc3(double,double,double,double);
static double readnumber(void){unsigned long long w;if(scanf("%llx",&w)!=1)exit(2);double v;memcpy(&v,&w,8);return v;}
static void word(double x){uint64_t w;memcpy(&w,&x,8);printf("%016llx ",(unsigned long long)w);}
static int subzero(double *a,int n,int i){return a[2*(i+n*(i-1))]==0&&a[2*(i+n*(i-1))+1]==0;}
int main(void){char op;while(scanf(" %c",&op)==1){int n;if(scanf("%d",&n)!=1||n<0||n>64)return 3;
 if(op=='h'){
  double a[128],sum=0;for(int i=0;i<2*n;i++)a[i]=readnumber();int prefix=n/8*8;
  for(int i=0;i<prefix;i++)sum+=fma(a[2*i],a[2*i],a[2*i+1]*a[2*i+1]);
  for(int i=prefix;i<n;i++){double norm=a[2*i]*a[2*i]+a[2*i+1]*a[2*i+1];sum+=norm;}
  if(sum!=0){double norm=sqrt(sum),first=fma(a[0],a[0],a[1]*a[1]),re,im;
   if(first==0){re=1/norm;im=0;}else{double firstNorm=sqrt(first),s=fmax(fabs(a[0]),fabs(a[1]));double _Complex q=__divdc3(firstNorm/s,0/s,a[0]/s,a[1]/s);re=creal(q)/(norm+firstNorm);im=cimag(q)/(norm+firstNorm);}
   for(int i=0;i<n;i++){double ar=a[2*i],ai=a[2*i+1];a[2*i]=fma(re,ar,-(im*ai));a[2*i+1]=fma(im,ar,re*ai);}}
  a[0]=1;a[1]=0;word(sum);for(int i=0;i<2*n;i++)word(a[i]);
 }else if(op=='d'){
  double tol=readnumber(),floor=readnumber(),a[8192];unsigned long long cv;if(scanf("%llu",&cv)!=1)return 4;
  for(int i=0;i<2*n*n;i++)a[i]=readnumber();uint64_t converged=cv,left=0;
  if(n<3)converged=n;
  else{
   for(int i=1;i<n-converged;i++){int s=2*(i+n*(i-1)),c=2*(i+n*i),p=2*((i-1)+n*(i-1));
    double sub=sqrt(fma(a[s],a[s],a[s+1]*a[s+1]));double dn=sqrt(fma(a[c],a[c],a[c+1]*a[c+1]));double pn=sqrt(a[p]*a[p]+a[p+1]*a[p+1]);
    if(sub<tol*(dn+pn)||sqrt(a[s]*a[s]+a[s+1]*a[s+1])<floor+floor){a[s]=0;a[s+1]=0;}}
   uint64_t nm2=n-2,u2,u12;
   for(;;){u2=(n-1)-converged;if((uint64_t)(n-1)<converged||u2==0)goto upper;
    if(!subzero(a,n,(int)u2))goto upper;
    converged++;continue;
upper:u2=nm2-converged;if(nm2<converged||u2==0)goto done;
    u12=(n-3)-converged;(void)u12;
    if(!subzero(a,n,(int)u2))goto done;
    converged++;
   }
done:if(nm2<=converged)converged=n;
   uint64_t k=(uint64_t)n+~converged;k=k?k-1:0;left=n!=converged?k:0;
   while(left){if(subzero(a,n,(int)left))break;left--;}
  }
  printf("%llu %llu ",(unsigned long long)left,(unsigned long long)converged);for(int i=0;i<2*n*n;i++)word(a[i]);
 }else return 5;putchar('\n');}return 0;}
