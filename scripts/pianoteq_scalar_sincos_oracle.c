// Independent Darwin system __sincosf oracle; no target application code or data.
#include <stdint.h>
#include <stdio.h>
#include <math.h>
#include <string.h>
int main(void) {
    uint32_t input;
    while (scanf("%x", &input) == 1) {
        float value, sine, cosine;
        uint32_t sine_bits, cosine_bits;
        memcpy(&value, &input, sizeof(value));
        __sincosf(value, &sine, &cosine);
        memcpy(&sine_bits, &sine, sizeof(sine_bits));
        memcpy(&cosine_bits, &cosine, sizeof(cosine_bits));
        printf("%08x %08x\n", sine_bits, cosine_bits);
    }
    return ferror(stdin) ? 1 : 0;
}
