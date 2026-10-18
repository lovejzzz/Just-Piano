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
        // Native swaps source auxiliaries and copies last P/Q and A/B into
        // the hole. The vacated A/B stay intact; O+30 input weights are the
        // coefficients cleared along with P/Q, not O+8 recurrence A/B.
        const old = { ...state }, tailA = tail.A, tailB = tail.B;
        Object.assign(state, tail);
        Object.assign(tail, old, { energy: 0, A: tailA, B: tailB });
      }
      const vacated = states.get(last);
      vacated.P = 0; vacated.Q = 0;
      // Removing the last slot does not itself clear its cached energy.
    }
  }
  return { layout: next, removed };
}

// 8dbbf4..8dbc64: sum cached energy in four independent SIMD lanes, including
// the padded tail of each nonempty logical group, then native pair reduction.
export function sumModalEnergy(states,layout) {
  const sums=[0,0,0,0];
  for(const [start,,,count] of layout) {
    if(!count)continue;
    for(let block=Math.floor(start/4);block<Math.ceil((start+count)/4);block++)
      for(let i=0;i<4;i++) {
        const value=states.get(block*4+i)?.energy;
        if(!Number.isFinite(value)||value<0)throw new RangeError('Complete nonnegative cached modal energy required');
        sums[i]=f32(sums[i]+value);
      }
  }
  return f32(f32(sums[0]+sums[2])+f32(sums[1]+sums[3]));
}
