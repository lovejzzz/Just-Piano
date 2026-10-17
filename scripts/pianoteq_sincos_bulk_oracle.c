// Public system __sincos, in an ordinary independent process.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void) {
  unsigned long long word;
  while (scanf("%llx", &word) == 1) {
    uint64_t raw = word, sine, cosine;
    double x, s, c;
    memcpy(&x, &raw, 8);
    __sincos(x, &s, &c);
    memcpy(&sine, &s, 8);
    memcpy(&cosine, &c, 8);
    printf("%016llx %016llx\n", (unsigned long long)sine, (unsigned long long)cosine);
  }
  return 0;
}
