// Independent scalar C finite-branch matrix update and Hessenberg oracle.
#define main foundation_oracle_main
#include "pianoteq_qr_foundation_oracle.c"
#undef main
static double norm2(double *v,int n){double sum=0;int prefix=n/8*8;for(int i=0;i<prefix;i++)sum+=fma(v[2*i],v[2*i],v[2*i+1]*v[2*i+1]);for(int i=prefix;i<n;i++)sum+=v[2*i]*v[2*i]+v[2*i+1]*v[2*i+1];return sum;}
static void times(double ar,double ai,double br,double bi,double *r,double *im){*r=fma(ar,br,-(ai*bi));*im=fma(ai,br,ar*bi);}
static void householder(double *v,int n){double sum=norm2(v,n);if(sum!=0){double total=sqrt(sum),first=fma(v[0],v[0],v[1]*v[1]),r,im;if(first==0){r=1/total;im=0;}else{double a=sqrt(first),s=fmax(fabs(v[0]),fabs(v[1]));double _Complex z=__divdc3(a/s,0/s,v[0]/s,v[1]/s);r=creal(z)/(total+a);im=cimag(z)/(total+a);}for(int i=0;i<n;i++){double x,y;times(r,im,v[2*i],v[2*i+1],&x,&y);v[2*i]=x;v[2*i+1]=y;}}v[0]=1;v[1]=0;}
static double reflect(double *a,int rows,int cols,int rs,int re,int cs,int ce,double *v,int left,double *w){
 int h=re-rs,width=ce-cs,n=left?h:width,m=left?width:h;double beta=-2/norm2(v,n);for(int i=0;i<2*m;i++)w[i]=0;
 for(int c=0;c<width;c++)for(int r=0;r<h;r++){
  int j=left?r:c,k=2*(rs+r+rows*(cs+c));double vr,vi,pr,pi;times(beta,0,v[2*j],v[2*j+1],&vr,&vi);
  if(left){pr=fma(a[k],vr,a[k+1]*vi);pi=fma(a[k],vi,-(a[k+1]*vr));j=c;}else{times(vr,vi,a[k],a[k+1],&pr,&pi);j=r;}
  w[2*j]+=pr;w[2*j+1]+=pi;
 }
 for(int c=0;c<width;c++)for(int r=0;r<h;r++){
  double lr=left?v[2*r]:w[2*r],li=left?v[2*r+1]:w[2*r+1],rr=left?w[2*c]:v[2*c],ri=left?w[2*c+1]:v[2*c+1];
  int k=2*(rs+r+rows*(cs+c));a[k]+=fma(rr,lr,ri*li);a[k+1]+=fma(rr,li,-(ri*lr));
 }
 return beta;
}
int main(void){char op;while(scanf(" %c",&op)==1){int rows,cols,rs,re,cs,ce,n;double a[512],v[32],w[32],wr[32];
 if(op=='h'){
  if(scanf("%d",&n)!=1||n<0||n>12)return 10;for(int i=0;i<2*n*n;i++)a[i]=readnumber();printf("ok ");
  for(int start=1;start<n-1;start++){
   for(int r=start;r<n;r++){int k=2*(r+n*(start-1));v[2*(r-start)]=a[k];v[2*(r-start)+1]=a[k+1];}householder(v,n-start);
   double b1=reflect(a,n,n,start,n,start-1,n,v,1,w),b2=reflect(a,n,n,0,n,start,n,v,0,wr);
   word(b1);word(b2);for(int i=0;i<2*(n-start);i++)word(v[i]);for(int i=0;i<2*(n-start+1);i++)word(w[i]);for(int i=0;i<2*n;i++)word(wr[i]);
  }for(int i=0;i<2*n*n;i++)word(a[i]);
 }else if(op=='l'||op=='r'){
  if(scanf("%d %d %d %d %d %d",&rows,&cols,&rs,&re,&cs,&ce)!=6||rows<1||rows>12||cols<1||cols>12)return 11;
  n=op=='l'?re-rs:ce-cs;for(int i=0;i<2*n;i++)v[i]=readnumber();for(int i=0;i<2*rows*cols;i++)a[i]=readnumber();
  double beta=reflect(a,rows,cols,rs,re,cs,ce,v,op=='l',w);printf("ok ");word(beta);int m=op=='l'?ce-cs:re-rs;for(int i=0;i<2*m;i++)word(w[i]);for(int i=0;i<2*rows*cols;i++)word(a[i]);
 }else return 12;putchar('\n');}return 0;}
