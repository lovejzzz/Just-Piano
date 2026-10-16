// Independent host-library oracle. Build on macOS with:
// clang -O0 scripts/pianoteq_native_math_oracle.c -framework Accelerate -o /tmp/piano-math-oracle
#include <Accelerate/Accelerate.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <dlfcn.h>

static float decode(uint32_t value) { float output; memcpy(&output,&value,4); return output; }
static uint32_t encode(float value) { uint32_t output; memcpy(&output,&value,4); return output; }
int main(void) {
  Dl_info image;
  if(dladdr(dlsym(RTLD_DEFAULT,"vexpf"),&image)) fprintf(stderr,"vexpf image: %s\n",image.dli_fname);
  if(dladdr(dlsym(RTLD_DEFAULT,"logf"),&image)) fprintf(stderr,"logf image: %s\n",image.dli_fname);
  char line[256], mode[16]; unsigned a,b,c,d;
  while(fgets(line,sizeof(line),stdin)) {
    if(sscanf(line,"%15s %x %x %x %x",mode,&a,&b,&c,&d)==5 && strcmp(mode,"exp4")==0) {
      vFloat value={decode(a),decode(b),decode(c),decode(d)};
      vFloat result=vexpf(value);
      printf("%08x %08x %08x %08x\n",encode(result[0]),encode(result[1]),encode(result[2]),encode(result[3]));
    } else if(sscanf(line,"%15s %x",mode,&a)==2 && strcmp(mode,"log")==0) {
      // Volatile input and -O0 prevent compile-time/builtin substitution.
      volatile float value=decode(a);
      printf("%08x\n",encode(logf(value)));
    } else return 2;
  }
  return ferror(stdin)?1:0;
}
