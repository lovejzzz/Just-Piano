// Independent ARM instruction oracle. Reads binary32 hex words from stdin.
// Contains no target application code or data. Requires AArch64 NEON.
#include <arm_neon.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(void) {
    uint32_t input;
    while (scanf("%x", &input) == 1) {
        float x;
        memcpy(&x, &input, sizeof(x));
        float32x4_t values = vdupq_n_f32(x);
        float32x4_t seeds = vrecpeq_f32(values);
        float32x4_t steps = vrecpsq_f32(values, seeds);
        float32x4_t refined = vmulq_f32(seeds, steps);
        float seed = vgetq_lane_f32(seeds, 0), result = vgetq_lane_f32(refined, 0);
        uint32_t seed_bits, result_bits;
        memcpy(&seed_bits, &seed, sizeof(seed));
        memcpy(&result_bits, &result, sizeof(result));
        printf("%08x %08x %08x\n", input, seed_bits, result_bits);
    }
    return ferror(stdin) ? 1 : 0;
}
