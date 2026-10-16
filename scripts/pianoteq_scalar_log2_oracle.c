// Independent system log2f oracle. Build with clang -O0 -fno-builtin-log2f.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void) {
 uint32_t word;
 while (scanf("%x", &word) == 1) {
  float input, output; memcpy(&input, &word, 4); volatile float x = input;
  output = log2f(x); memcpy(&word, &output, 4); printf("%08x\n", word);
 }
 return ferror(stdin) ? 1 : 0;
}
