// 07a60c initializes paired controls; 460260..4602e8 computes ratios.
// These are scalar corrections to modal pitch/decay, not the complete contact law.
const f = Math.fround;
const finite = value => Number.isFinite(value) && Number.isFinite(f(value));
export function voiceHeaderRatios({initialSpread, currentSpread, initialImpedance, currentImpedance}) {
  if (![initialSpread, currentSpread, initialImpedance, currentImpedance].every(finite) ||
      !(f(initialImpedance) > 0) || !(f(currentImpedance) > 0))
    throw new RangeError('Finite float controls and positive impedance pair required');
  const initial = f(initialSpread), current = f(currentSpread);
  let adjustmentRatio = 1;
  if (initial !== current) {
    const base = Math.max(f(0.001), initial), edited = Math.max(f(0.001), current);
    adjustmentRatio = f(edited / base);
    if (edited > base && f(20 / base) > 50)
      adjustmentRatio = f(adjustmentRatio * f(f(base * 50) / 20));
  }
  return Object.freeze({adjustmentRatio, decayScale: f(f(initialImpedance) / f(currentImpedance))});
}

// Supported offline profile: no host automation, notes and the explicitly
// assigned CC64 Rattle only. Other control paths must be implemented explicitly.
export function archiveFixedVoiceHeaderRatios({presetFields, events, systemExclusiveCount}) {
  const value = offset => presetFields.find(row => row.object_offset === offset)?.value;
  const assignment = value(0x1518);
  if (systemExclusiveCount !== 0 || !Array.isArray(events) || !events.length ||
      !Array.isArray(assignment) || assignment.length !== 4 ||
      assignment.some((v, i) => v !== [2, 3, 4, 6][i]) || events.some(e =>
        e.channel !== 0 || !['noteOn', 'noteOff', 'controlChange'].includes(e.kind) ||
        e.kind === 'controlChange' && e.controller !== 64))
    throw new RangeError('Fixed offline controls with notes and assigned Rattle only required');
  const initialSpread = value(0x470)?.a, initialImpedance = value(0x588)?.scalars?.[0];
  const header = {initialSpread, currentSpread: initialSpread, initialImpedance, currentImpedance: initialImpedance};
  return Object.freeze({...voiceHeaderRatios(header), header: Object.freeze(header),
    hostAutomationSupported: false, dynamicRatioEventsSupported: false});
}
