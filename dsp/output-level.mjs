// 4f9904 with a settled 84df2c level state; active ramps need separate validation.
export function applySettledOutputLevel(channels,state){
 if(state.length!==4||state[3]!==0||!state.every(Number.isFinite))throw new Error('Unverified active output level ramp');
 return channels.map(row=>Float32Array.from(row,v=>Math.fround(v*state[0])));
}
