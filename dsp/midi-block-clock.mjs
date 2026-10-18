// Format-zero PPQ events on the observed native offline 64-sample clock.
// Only source MIDI and explicit render settings are inputs; no runtime counters.
export function midiBlockClock(bytes, {sampleRate, blockSize = 64}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > 8 * 1024 * 1024 ||
      !Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > 384000 || blockSize !== 64)
    throw new RangeError('Bounded MIDI and explicit supported render clock required');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start, word) => [...word].every((c, i) => bytes[start + i] === c.charCodeAt(0));
  const ppq = view.getUint16(12);
  if (!text(0, 'MThd') || view.getUint32(4) !== 6 || view.getUint16(8) !== 0 || view.getUint16(10) !== 1 ||
      !ppq || ppq & 0x8000 || !text(14, 'MTrk') || view.getUint32(18) !== bytes.length - 22)
    throw new RangeError('Complete single-track PPQ format-zero MIDI required');
  let position = 22, ticks = 0, running, tempo = 500000, numerator = 0n, ended = false;
  const denominator = BigInt(ppq) * 1000000n, events = [];
  const byte = () => { if (position >= bytes.length) throw new RangeError('Truncated MIDI'); return bytes[position++]; };
  const vlq = () => {
    let value = 0;
    for (let i = 0; i < 4; i++) { const b = byte(); value = value * 128 + (b & 127); if (!(b & 128)) return value; }
    throw new RangeError('Invalid MIDI VLQ');
  };
  const frame = () => {
    const n = numerator / denominator / BigInt(blockSize) * BigInt(blockSize);
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('MIDI clock exceeds exact integer range');
    return Number(n);
  };
  while (position < bytes.length) {
    const delta = vlq(); ticks += delta;
    if (!Number.isSafeInteger(ticks)) throw new RangeError('MIDI tick range exceeded');
    numerator += BigInt(delta) * BigInt(tempo) * BigInt(sampleRate);
    let status = byte();
    if (status < 128) { if (!running) throw new RangeError('Missing running status'); position--; status = running; }
    if (status === 0xff) {
      running = undefined; const type = byte(), length = vlq();
      if (length > bytes.length - position) throw new RangeError('Truncated meta event');
      if (type === 0x51) {
        if (length !== 3) throw new RangeError('Invalid tempo event');
        tempo = bytes[position] * 65536 + bytes[position + 1] * 256 + bytes[position + 2];
        if (!tempo) throw new RangeError('Positive MIDI tempo required');
      }
      position += length;
      if (type === 0x2f) {
        if (length || position !== bytes.length) throw new RangeError('Invalid MIDI ending');
        ended = true; break;
      }
    } else if (status === 0xf0 || status === 0xf7) {
      running = undefined; const length = vlq();
      if (length > bytes.length - position) throw new RangeError('Truncated SysEx');
      position += length;
    } else if (status >= 0x80 && status <= 0xef) {
      running = status; const kind = status >> 4, a = byte(), b = [12, 13].includes(kind) ? undefined : byte();
      if (a >= 128 || b >= 128) throw new RangeError('Invalid MIDI channel data');
      const event = {ticks, channel: status & 15, status: kind, data: b === undefined ? [a] : [a, b], frame: frame()};
      if (kind === 9 && b > 0) Object.assign(event, {kind: 'noteOn', note: a, velocity: b});
      else if (kind === 8 || kind === 9) Object.assign(event, {kind: 'noteOff', note: a, velocity: b});
      else if (kind === 11) Object.assign(event, {kind: 'controlChange', controller: a, value: b});
      else event.kind = 'other';
      events.push(event);
      if (events.length > 1000000) throw new RangeError('MIDI event bound exceeded');
    } else throw new RangeError('Unsupported MIDI status');
  }
  if (!ended) throw new RangeError('Missing end-of-track');
  return {sampleRate, blockSize, ppq, events, noteOns: events.filter(e => e.kind === 'noteOn'), endFrame: frame()};
}
