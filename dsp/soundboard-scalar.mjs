// Scalar prefix of FUN_1005a8874. The coefficient arrays and propagation loop
// remain separate; this module only preserves the observed float32 order.
const f = Math.fround;

function finite(name, value) {
  if (!Number.isFinite(value)) throw new RangeError(`Finite ${name} required`);
  return value;
}

export function soundboardScalarControls({h, tau, T, p, q, r}) {
  for (const [name, value] of Object.entries({h, tau, T, p, q, r})) {
    finite(name, value);
  }
  if (!(h > 0) || !(tau > 0) || !(T >= 0)) {
    throw new RangeError('Positive h/tau and nonnegative T required');
  }
  const steps = Math.floor(f(f(T / tau) + 1));
  const d = f(f(q * tau) * 0.5);
  const denominator = f(1 + d);
  if (!(denominator > 0)) throw new RangeError('Positive propagation denominator required');
  const tau2 = f(tau * tau);
  const h2 = f(h * h);
  const velocityRatio = f(f(p * tau) / h2);
  const velocitySquare = f(velocityRatio * velocityRatio);
  const alpha = f(-f(velocitySquare / f(12 * denominator)));
  const beta = f(f(r * tau) / denominator);
  const rho = f(f(d - 1) / denominator);
  const eta = f(2 / denominator);
  const epsilon = f(tau2 / denominator);
  return {
    h, tau, T, p, q, r, steps,
    d, denominator, velocitySquare,
    alpha, beta, rho, eta, epsilon,
  };
}
