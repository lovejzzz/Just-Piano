// macOS ARM64 hypotf: float inputs -> separate double squares/add -> sqrt
// -> float result (function offsets 0x18..0x34). No double FMA or rescaling.
// Infinity wins over NaN; NaN payloads and FP exception flags are not modeled.
const f = Math.fround;
export function nativeScalarHypotf(x, y) {
  x = f(x); y = f(y);
  if (Math.abs(x) === Infinity || Math.abs(y) === Infinity) return Infinity;
  const xx = x * x, yy = y * y;
  return f(Math.sqrt(xx + yy));
}
