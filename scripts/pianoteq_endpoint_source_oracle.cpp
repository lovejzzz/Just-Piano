// Independent C++/system-math row-paired source endpoint oracle.
#include <algorithm>
#include <vector>
#include <numeric>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>
extern "C" float phase_wrap_scalar(float);
static float value(uint32_t w){float x;std::memcpy(&x,&w,4);return x;}
static float amplitude(float a,float b,float t){
  if(a==0&&b==0)return 0;
  float u=1.0f-t,floor=expf(-40.0f*value(0x3debc8e3));
  float p=a==0?b*floor:a,q=b==0?a*floor:b;
  float first=t*logf(p),out=expf(fmaf(u,logf(q),first));
  if(a==0){out*=static_cast<float>(pow(static_cast<double>(u),.25));if(fabsf(out)<value(0x1e3ce508))out=value(0x1e3ce508);}
  if(b==0){out*=static_cast<float>(pow(static_cast<double>(t),.25));if(fabsf(out)<value(0x1e3ce508))out=value(0x1e3ce508);}
  return out;
}
int main(){
  unsigned ra,rb,columns;uint32_t wt;
  for(;;){
    int status=std::scanf("%u %u %u %x",&ra,&rb,&columns,&wt);
    if(status==EOF)return 0;if(status!=4||columns<1||columns>8||ra>1000||rb>1000)return 2;
    float t=value(wt);if(!std::isfinite(t)||t<0||t>1)return 3;
    std::vector<float> a[4],b[4],out[4];
    for(unsigned side=0;side<2;side++)for(unsigned field=0;field<4;field++){
      auto& table=side?b[field]:a[field];table.resize((side?rb:ra)*columns);
      for(auto& x:table){uint32_t w;if(std::scanf("%x",&w)!=1)return 4;x=value(w);if(!std::isfinite(x))return 5;}
    }
    unsigned rows;
    if(t==0||t==1){rows=t==1?ra:rb;for(unsigned k=0;k<4;k++)out[k]=t==1?a[k]:b[k];}
    else{
      rows=std::min(ra,rb);for(auto& table:out)table.resize(rows*columns);
      double s=sin((static_cast<double>(t)*0x1.921fb54442d18p+1)*.5);float w=s*s,v=1.0f-w,u=1.0f-t;
      for(unsigned c=0;c<columns;c++){
        std::vector<float> mixed[4];for(auto& table:mixed)table.resize(rows);
        for(unsigned r=0;r<rows;r++){
          auto i=r*columns+c;
          for(unsigned k=0;k<2;k++)mixed[k][r]=fmaf(a[k][i],w,b[k][i]*v);
          mixed[2][r]=amplitude(a[2][i],b[2][i],t);
          float left=phase_wrap_scalar(a[3][i]),right=phase_wrap_scalar(b[3][i]);
          unsigned type=(a[2][i]==0?1:0)+(b[2][i]==0?2:0);
          if(type==1)left=right;else if(type==2)right=left;else if(type==3)left=right=0;
          mixed[3][r]=phase_wrap_scalar(fmaf(t,left,u*right));
        }
        std::vector<uint32_t> indices(rows);std::iota(indices.begin(),indices.end(),0);
        std::sort(indices.begin(),indices.end(),[&](uint32_t x,uint32_t y){return mixed[0][x]<mixed[0][y];});
        for(unsigned r=0;r<rows;r++)for(unsigned k=0;k<4;k++)out[k][r*columns+c]=mixed[k][indices[r]];
      }
    }
    std::printf("%u %u",rows,columns);
    for(const auto& table:out)for(float x:table){uint32_t w;std::memcpy(&w,&x,4);std::printf(" %08x",w);}
    std::printf("\n");
  }
}
