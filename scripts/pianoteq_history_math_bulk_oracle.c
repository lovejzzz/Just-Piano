// Independent system-library oracle; no target code or model data.
// Build with clang -O0 -fno-builtin-exp2f -fno-builtin-log10f.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void) {
 char name[16]; uint32_t word;
 while (scanf("%15s %x", name, &word) == 2) {
  float input, output; memcpy(&input, &word, 4); volatile float x = input;
  if (!strcmp(name, "exp2f")) output = exp2f(x);
  else if (!strcmp(name, "log10f")) output = log10f(x);
  else return 2;
  memcpy(&word, &output, 4); printf("%08x\n", word);
 }
 return ferror(stdin) ? 1 : 0;
}
