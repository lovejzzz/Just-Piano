// Ordinary independent system exp2/log2 program, raw IEEE arguments/results.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(int argc, char **argv) {
  if (argc != 2 || (strcmp(argv[1], "exp2") && strcmp(argv[1], "log2"))) return 2;
  unsigned long long word;
  while (scanf("%llx", &word) == 1) {
    uint64_t raw = word;
    double x, y; memcpy(&x, &raw, 8);
    y = !strcmp(argv[1], "exp2") ? exp2(x) : log2(x);
    memcpy(&raw, &y, 8); printf("%016llx\n", (unsigned long long)raw);
  }
  return 0;
}
