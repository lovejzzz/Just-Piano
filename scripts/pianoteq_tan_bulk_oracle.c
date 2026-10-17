// Ordinary independent system math process, no target attachment.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void) {
  unsigned long long word;
  while (scanf("%llx", &word) == 1) {
    uint64_t raw = word;
    double x, y;
    memcpy(&x, &raw, 8);
    y = tan(x);
    memcpy(&raw, &y, 8);
    printf("%016llx\n", (unsigned long long)raw);
  }
  return 0;
}
