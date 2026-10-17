// Ordinary independent system pow process; raw IEEE arguments/results.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void) {
  unsigned long long a, b;
  while (scanf("%llx %llx", &a, &b) == 2) {
    uint64_t wa = a, wb = b, result;
    double x, y, z;
    memcpy(&x, &wa, 8); memcpy(&y, &wb, 8);
    z = pow(x, y); memcpy(&result, &z, 8);
    printf("%016llx\n", (unsigned long long)result);
  }
  return 0;
}
