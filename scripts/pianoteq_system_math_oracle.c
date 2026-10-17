// Independent macOS system-library oracle, containing no target code or data.
// Build: clang -O0 scripts/pianoteq_system_math_oracle.c -o /tmp/piano-math-oracle
// Arguments/results are IEEE binary64 hexadecimal words, including log2f's
// float input/output promoted to double. This is a validation aid, not a browser
// implementation of the native transcendental dependencies.
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static double decode(const char *text) {
    uint64_t bits = strtoull(text, NULL, 16);
    double value;
    memcpy(&value, &bits, sizeof(value));
    return value;
}

static void print_bits(double value) {
    uint64_t bits;
    memcpy(&bits, &value, sizeof(bits));
    printf("%016llx", (unsigned long long)bits);
}

int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "hypotf-bulk")) {
        uint32_t a, b, output;
        while (scanf("%x %x", &a, &b) == 2) {
            float x, y, value;
            memcpy(&x, &a, 4); memcpy(&y, &b, 4);
            value = hypotf(x, y); memcpy(&output, &value, 4);
            printf("%08x\n", output);
        }
        return ferror(stdin) || ferror(stdout) ? 3 : 0;
    }
    if (argc < 3) return 2;
    volatile double x = decode(argv[2]);
    volatile double y = argc > 3 ? decode(argv[3]) : 0;
    double result;
    if (!strcmp(argv[1], "log2f")) result = log2f((float)x);
    else if (!strcmp(argv[1], "log10f")) result = log10f((float)x);
    else if (!strcmp(argv[1], "expf")) result = expf((float)x);
    else if (!strcmp(argv[1], "exp2f")) result = exp2f((float)x);
    else if (!strcmp(argv[1], "exp2")) result = exp2(x);
    else if (!strcmp(argv[1], "log2")) result = log2(x);
    else if (!strcmp(argv[1], "exp")) result = exp(x);
    else if (!strcmp(argv[1], "tan")) result = tan(x);
    else if (!strcmp(argv[1], "sin")) result = sin(x);
    else if (!strcmp(argv[1], "pow")) {
        if (argc != 4) return 2;
        result = pow(x, y);
    }
    else if (!strcmp(argv[1], "powf")) {
        if (argc != 4) return 2;
        result = powf((float)x, (float)y);
    }
    else if (!strcmp(argv[1], "hypotf")) {
        if (argc != 4) return 2;
        result = hypotf((float)x, (float)y);
    }
    else if (!strcmp(argv[1], "atan2f")) {
        if (argc != 4) return 2;
        result = atan2f((float)x, (float)y);
    }
    else if (!strcmp(argv[1], "log")) result = log(x);
    else if (!strcmp(argv[1], "sincos")) {
        double sine, cosine;
        __sincos(x, &sine, &cosine);
        print_bits(sine);
        printf(" ");
        print_bits(cosine);
        printf("\n");
        return 0;
    }
    else return 2;
    print_bits(result);
    printf("\n");
    return 0;
}
