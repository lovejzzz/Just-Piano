// Independent system pow oracle for a float32 base and double exponent 3.
// Build with clang -O0 -fno-builtin-pow; no target application code or data.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void) {
 uint32_t word;
 while (scanf("%x", &word) == 1) {
  float input; memcpy(&input, &word, 4);
  volatile double x = (double)input, exponent = 3.0;
  double result = pow(x, exponent); uint64_t output;
  memcpy(&output, &result, 8); printf("%016llx\n", (unsigned long long)output);
 }
 return ferror(stdin) ? 1 : 0;
}
