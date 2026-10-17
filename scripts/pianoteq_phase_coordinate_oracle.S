// Independent ARM FCVTZU/UCVTF coordinate classification.
.text
.p2align 2
.globl _source_phase_unsigned
_source_phase_unsigned:
  fcvtzu w0, s0
  ret
.p2align 2
.globl _source_phase_roundtrip
_source_phase_roundtrip:
  fcvtzu s0, s0
  ucvtf s0, s0
  ret
