// Independent C/system-math constant-curve/no-band N=1 chain oracle.
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <complex.h>
extern double _Complex __divdc3(double,double,double,double);
static double number(uint64_t w){double x;memcpy(&x,&w,8);return x;}
static void dword(double x){uint64_t w;memcpy(&w,&x,8);printf(" %016llx",(unsigned long long)w);}
static void fword(float x){uint32_t w;memcpy(&w,&x,4);printf(" %08x",w);}
int main(void){
  for(;;){
    unsigned row;int n=scanf("%u",&row);if(n==EOF)return 0;if(n!=1||row>1000)return 2;
    uint64_t words[16];double x[16];
    for(int i=0;i<16;i++){unsigned long long w;if(scanf("%llx",&w)!=1)return 3;words[i]=w;x[i]=number(words[i]);if(!isfinite(x[i]))return 4;}
    double base=x[0],stiffness=x[1];float spread=x[2],mode=x[3],coordinateScale=x[4],fundamental=x[5],power=x[6],curveDb=x[7],note=x[8],jitter=x[9];
    float strength=x[10],minimum=x[11],tilt=x[12],mixture=x[13],radius=x[14],phase=x[15];
    double squared=(double)mode*(double)mode,center=(base*(double)mode)*sqrt(fma(stiffness+(double)spread,squared,1));
    float reference=base*(double)coordinateScale,frequency=center,logarithm=log10f(power),baseDb=10.0f*logarithm,extraDb=baseDb+curveDb;
    float ratio=frequency/fmaxf(minimum,reference),slope=fminf((-tilt)*log2f(ratio),0);
    double initialDb=(double)fmaxf(slope,-200.0f)+(double)extraDb;
    double gain=exp((initialDb/10.0)*number(0x40026bb1bbb55516ULL))*(double)strength;
    float phaseFraction=phase/180.0f;double theta=(double)phaseFraction*0x1.921fb54442d18p+1;
    double sine,cosine;__sincos(theta,&sine,&cosine);
    double tangent=tan(theta),magnitude=1.0/sqrt(fma(tangent,tangent,1));
    float complement=1.0f-mixture;
    double phaseGain=exp(fma(log(magnitude),(double)mixture,(double)complement*0));
    double scale=fmin(1e12,fmax(1,gain))*phaseGain;
    double impedanceP=(cosine*(double)radius)*scale,impedanceQ=(sine*(double)radius)*scale;
    uint32_t state=(uint32_t)(int32_t)fmaf(note,10.0f,10000.0f);
    uint32_t a=state,b=a*0x41c64e6du+0x3039u,c=b*0x41c64e6du+0x3039u,d=c*0x41c64e6du+0x3039u;
    double factor=1;
    for(unsigned i=0;i<=row;i++){
      uint32_t t=a^(a<<11);a=b;b=c;c=d;d=(d>>19)^(t>>8)^d^t;
      float fraction=(double)d/4294967296.0;factor=fma((double)fraction-.5,(double)jitter,1);
    }
    double p=impedanceP*factor,q=impedanceQ*factor;double _Complex inverse=__divdc3(1,0,p,q);
    float outFrequency=fma((double)mode/-0x1.921fb54442d18p+1,cimag(inverse),center),decay=((double)mode+(double)mode)*creal(inverse);
    printf("ok");fword(fundamental);fword(reference);fword(frequency);fword(extraDb);fword(outFrequency);fword(decay);
    dword(center);dword(impedanceP);dword(impedanceQ);dword(factor);dword(p);dword(q);printf("\n");
  }
}
