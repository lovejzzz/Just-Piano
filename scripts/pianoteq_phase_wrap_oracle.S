// Standalone ARM instruction transcriptions; no target code is executed.
.text
.p2align 2
.globl _phase_wrap_scalar
_phase_wrap_scalar:
  mov w8, #0x0fdb
  movk w8, #0x4049, lsl #16
  fmov s1, w8
  fadd s0, s0, s1
  movk w8, #0x40c9, lsl #16
  fmov s1, w8
  fdiv s2, s0, s1
  frintm s2, s2
  fmsub s0, s2, s1, s0
  fcvt d0, s0
  mov x8, #0x2d18
  movk x8, #0x5444, lsl #16
  movk x8, #0x21fb, lsl #32
  movk x8, #0xc009, lsl #48
  fmov d1, x8
  fadd d0, d0, d1
  fcvt s0, d0
  ret
.p2align 2
.globl _phase_wrap_vector
_phase_wrap_vector:
  ldr q0, [x0]
  mov w8, #0x0fdb
  movk w8, #0x4049, lsl #16
  dup v2.4s, w8
  movk w8, #0x40c9, lsl #16
  dup v3.4s, w8
  mov x8, #0x2d18
  movk x8, #0x5444, lsl #16
  movk x8, #0x21fb, lsl #32
  movk x8, #0xc009, lsl #48
  dup v4.2d, x8
  fadd v0.4s, v0.4s, v2.4s
  fdiv v1.4s, v0.4s, v3.4s
  frintm v1.4s, v1.4s
  fmls v0.4s, v1.4s, v3.4s
  fcvtl v1.2d, v0.2s
  fcvtl2 v0.2d, v0.4s
  fadd v0.2d, v0.2d, v4.2d
  fadd v1.2d, v1.2d, v4.2d
  fcvtn v1.2s, v1.2d
  fcvtn2 v1.4s, v0.2d
  str q1, [x1]
  ret
