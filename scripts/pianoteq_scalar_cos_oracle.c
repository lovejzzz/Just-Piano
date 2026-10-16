// Independent system cosf oracle; no target application code or data.
// Build with clang -O0 -fno-builtin-cosf and link libm where required.
#include <stdint.h>
#include <stdio.h>
#include <math.h>
#include <string.h>
int main(void) {
    uint32_t input;
    while (scanf("%x", &input) == 1) {
        float value, result;
        memcpy(&value, &input, sizeof(value));
        volatile float argument = value;
        result = cosf(argument);
        uint32_t output;
        memcpy(&output, &result, sizeof(output));
        printf("%08x\n", output);
    }
    return ferror(stdin) ? 1 : 0;
}
