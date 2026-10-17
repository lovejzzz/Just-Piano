// Standalone instruction transcription. Never attaches to Pianoteq.
// Input: float piano/mezzo/forte/All; output: three adjusted gains.
// s16/d17 replace callee-saved registers in the original sequence.
.text
.align 2
.globl _all_hardness_instruction_oracle
_all_hardness_instruction_oracle:
  ldr s16, [x0]
  ldr d17, [x0, #4]
  ldr s0, [x0, #12]
  fmov s1, #-1.0
  fcmp s0, s1
  fcsel s0, s1, s0, mi
  fmov s1, #1.0
  fcmp s0, s1
  fcsel s0, s1, s0, gt
  fcmp s0, #0.0
  b.eq 1f
  fadd s1, s0, s1
  fmul s2, s16, s1
  fcmp s2, #0.0
  movi v3.2d, #0
  fcsel s2, s3, s2, mi
  fmov s3, #2.0
  fcmp s2, s3
  fcsel s2, s3, s2, gt
  fmov s4, #0.5
  fcmp s0, s4
  fmov s4, #-0.5
  fadd s0, s0, s4
  fadd s0, s0, s0
  fsub s3, s3, s2
  fmadd s3, s0, s3, s2
  fmul v4.2s, v17.2s, v1.s[0]
  fcmlt v5.2s, v4.2s, #0.0
  bic v4.8b, v4.8b, v5.8b
  movi v5.2s, #0x40, lsl #24
  fcmgt v6.2s, v4.2s, v5.2s
  bit v4.8b, v5.8b, v6.8b
  fsub v6.2s, v5.2s, v4.2s
  fmla v4.2s, v6.2s, v0.s[0]
  fmul v0.2s, v17.2s, v1.s[0]
  fcmlt v1.2s, v0.2s, #0.0
  bic v0.8b, v0.8b, v1.8b
  fcmgt v1.2s, v0.2s, v5.2s
  bit v0.8b, v5.8b, v1.8b
  fcsel s16, s3, s2, pl
  fcsel d0, d4, d0, pl
  str s16, [x1]
  str d0, [x1, #4]
  ret
1:
  str s16, [x1]
  str d17, [x1, #4]
  ret
