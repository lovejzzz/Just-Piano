// The four-lane energy layout and compacting branch of 74b08c / 8db8b0.
// Call before frequency projection, with the previous block's modal state.
import { fma32 } from './modal-kernel.mjs';
const f32 = Math.fround;

export function modalEnergySample({ P, Q, radius, K, sinInverse }) {
  const difference = fma32(-K, Q, f32(radius * P));
  const orthogonal = f32(sinInverse * difference);
  return fma32(Q, Q, f32(orthogonal * orthogonal));
}

export function updateModalEnergyAndPrune(states, layout, { threshold, energyLayout, keepSlots, freezeLayout = false }) {
  if (energyLayout !== 2 || !Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError('Observed four-lane energy layout and finite amplitude threshold required');
  }
  const next = layout.map(row => [...row]), removed = [];
  for (const [start, , , count] of next) {
    const first = Math.floor(start / 4) * 4, end = Math.ceil((start + count) / 4) * 4;
    for (let lane = first; lane < end; lane++) {
      const state = states.get(lane);
      if (!state) throw new Error('Missing padded energy state');
      state.energy = modalEnergySample(state);
    }
  }
  const cutoff = f32(f32(threshold) * f32(threshold));
  for (const row of next) {
    const start = row[0];
    let lane = start;
    while (lane < start + row[3]) {
      const state = states.get(lane);
      if (state.energy >= cutoff) { lane++; continue; }
      if (keepSlots || freezeLayout) {
        state.P = 0; state.Q = 0;
        removed.push({ lane, keptSlot: true });
        lane++;
        continue;
      }
      const last = start + --row[3], tail = states.get(last);
      removed.push({ lane, last, keptSlot: false });
      if (last !== lane) {
        // Native swaps source/coefficient auxiliaries, copies last P/Q and
        // A/B into the hole, then clears only the vacated state/coefficient.
        const old = { ...state };
        Object.assign(state, tail);
        Object.assign(tail, old, { energy: 0 });
      }
      const vacated = states.get(last);
      vacated.P = 0; vacated.Q = 0; vacated.A = 0; vacated.B = 0;
      // Removing the last slot does not itself clear its cached energy.
    }
  }
  return { layout: next, removed };
}
