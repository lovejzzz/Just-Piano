// Independent local SDK libc++ oracle. No Pianoteq execution or model data.
#include <algorithm>
#include <vector>
#include <numeric>
#include <cstdint>
#include <cstring>
#include <cstdio>
#include <cmath>
int main(){
  unsigned n,mode;
  for(;;){
    int result=std::scanf("%u %u",&n,&mode);
    if(result==EOF)return 0;if(result!=2||n>100000||mode>1)return 2;
    std::vector<float> values(n);std::vector<uint32_t> indices(n);
    for(unsigned i=0;i<n;i++){
      uint32_t w;if(std::scanf("%x",&w)!=1)return 3;
      std::memcpy(&values[i],&w,4);if(!std::isfinite(values[i]))return 4;
    }
    std::iota(indices.begin(),indices.end(),0);
    const auto comparator=[&](uint32_t a,uint32_t b){return values[a]<values[b];};
    if(mode&&n>=24)std::partial_sort(indices.begin(),indices.end(),indices.end(),comparator);
    else std::sort(indices.begin(),indices.end(),comparator);
    std::printf("%u",n);for(auto i:indices)std::printf(" %u",i);std::printf("\n");
  }
}
