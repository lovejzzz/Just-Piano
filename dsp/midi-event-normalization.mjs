// Native MIDI-to-source-event normalization for the recovered Pianoteq
// Sustain Pedal path. The arithmetic below follows FUN_100042120,
// FUN_100546dd4 and FUN_10035e0b0 with explicit float32 boundaries.

const f32 = Math.fround;
const MIDI_7BIT_MAX = 127;
const MIDI_7BIT_DENOMINATOR = f32(1 / 127);
const DECIMAL_STEP = 1e-6;

function rinta(value) {
  const rounded = f32(value);
  return rounded >= 0 ? Math.floor(rounded + 0.5) : Math.ceil(rounded - 0.5);
}

// Port of the native decimal stabilizer used by FUN_10035e0b0. It chooses
// the short decimal value inside the native lower/upper interval.
export function nativeDecimalStabilize(a, b, epsilon = DECIMAL_STEP, flagA = 0, flagB = 0) {
  let lower = a;
  let upper = b;
  let lowerFlag = flagA;
  let upperFlag = flagB;

  if (lower > upper) {
    [lower, upper] = [upper, lower];
    [lowerFlag, upperFlag] = [upperFlag, lowerFlag];
  }

  const lowerShift = (lowerFlag === 0 ? 1.5 : -1.5) + lower / epsilon;
  const lowerInteger = Math.trunc(lowerShift >= 0 ? lowerShift : 0);
  const upperShift = (upperFlag === 0 ? -1.5 : 1.5) + upper / epsilon;
  const upperInteger = Math.trunc(upperShift > 1 ? upperShift : 1);

  let candidate = upperInteger < 100000001 ? 1 : 100000000;
  let scaled = candidate * 10000;
  if (upperInteger <= candidate * 10000) scaled = candidate;
  candidate = scaled * 100;
  if (upperInteger <= scaled * 100) candidate = scaled;
  while (candidate < upperInteger) candidate *= 10;
  if (upperInteger * 10 < candidate) {
    throw new RangeError('Native decimal stabilizer range failed');
  }

  if (lowerInteger <= candidate && candidate <= upperInteger) {
    return epsilon * candidate;
  }

  let divisor = 2;
  let remainder = candidate;
  do {
    if (remainder < divisor) break;
    const quotient = Math.floor(remainder / divisor);
    remainder = candidate;
    do {
      candidate = remainder;
      remainder = candidate - quotient;
    } while (quotient + lowerInteger <= candidate);
    const useTwo = divisor !== 2;
    divisor = useTwo ? 2 : 5;
    remainder = quotient;
  } while (candidate < lowerInteger || upperInteger < candidate);

  return epsilon * candidate;
}

// The recovered Sustain Pedal scale object is the identity over [0, 1].
// This was checked at the native scale primitive for all 128 CC64 values.
export function sustainPedalScale(value) {
  return f32(value);
}

export function scalarMidiCcToEventValue(cc) {
  if (!Number.isInteger(cc) || cc < 0 || cc > MIDI_7BIT_MAX) {
    throw new RangeError('MIDI CC must be an integer in 0..127');
  }
  const normalized = f32(f32(cc) * MIDI_7BIT_DENOMINATOR);
  const slot = rinta(f32(normalized / MIDI_7BIT_DENOMINATOR));
  const lower = f32(MIDI_7BIT_DENOMINATOR * f32(slot - 0.5));
  const upper = f32(lower + MIDI_7BIT_DENOMINATOR);
  const decimal = nativeDecimalStabilize(
    sustainPedalScale(lower),
    sustainPedalScale(upper),
    DECIMAL_STEP,
    1,
    upper === 1 ? 1 : 0,
  );
  return f32(decimal);
}

export function sustainPedalCcToEventValue(cc) {
  if (cc !== 64) throw new RangeError('Sustain Pedal expects MIDI CC 64');
  return scalarMidiCcToEventValue(cc);
}

export function softPedalCcToEventValue(cc) {
  if (cc !== 67) throw new RangeError('Soft Pedal expects MIDI CC 67');
  return scalarMidiCcToEventValue(cc);
}

export function sostenutoPedalCcToEventValue(cc) {
  if (cc !== 66) throw new RangeError('Sostenuto Pedal expects MIDI CC 66');
  return scalarMidiCcToEventValue(cc);
}

export function harmonicPedalCcToEventValue(cc) {
  if (cc !== 69) throw new RangeError('Harmonic Pedal expects MIDI CC 69');
  return scalarMidiCcToEventValue(cc);
}

export const MIDI_7BIT_MAX_VALUE = MIDI_7BIT_MAX;
export const MIDI_7BIT_DENOMINATOR_F32 = MIDI_7BIT_DENOMINATOR;
