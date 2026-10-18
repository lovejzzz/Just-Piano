import assert from 'node:assert/strict';
import {prepareSoundboardObservations} from '../dsp/soundboard-observation.mjs';
import {applySoundboardOutputKernel} from '../dsp/soundboard-output-kernel.mjs';

const observations = prepareSoundboardObservations({
  inverseScale: 2,
  amplitudeScale: 0.5,
  frequencies: [0.25, 2, 2.5],
  count: 3,
  cosf: (value) => Math.cos(value),
});
assert.equal(observations.length, 3);
assert.equal(observations[0].stateIndex, 0);
assert.equal(observations[2].stateIndex, 5);
assert.equal(observations[1].phaseWeight, 1);
assert.ok(Number.isFinite(observations[2].first));

const phased = prepareSoundboardObservations({
  inverseScale: 2,
  amplitudeScale: 0.5,
  frequencies: [0.25],
  phaseMode: true,
  cosf: () => 1,
});
assert.equal(phased[0].phaseWeight, 1);

const blocks = [
  new Float32Array(65).fill(1),
  new Float32Array(65).fill(2),
];
const output = new Float32Array(128);
applySoundboardOutputKernel({
  offset: 0,
  entries: [
    {stateIndex: 0, a: 0.25, b: 2, c: 3},
  ],
}, blocks, output, 0);
assert.equal(output[0], 1.25);
assert.equal(output[1], 5);
assert.equal(output[63], 5);
assert.equal(output[64], 3.75);

// Independent C float/fmaf oracle (-ffp-contract=off), with nonzero destination
// and three entries: catches reversed FMA operands and per-entry writes.
const f = Math.fround;
const oracleBlocks = Array.from({length: 3}, (_, e) => Float32Array.from(
  {length: 65}, (_, t) => f(f(((t * 17 + e * 13) % 31) - 15) / 9),
));
const oracleOutput = Float32Array.from({length: 128}, (_, t) => f(f((t % 11) - 5) / 7));
applySoundboardOutputKernel({offset: 0, entries: Array.from({length: 3}, (_, e) => ({
  stateIndex: e, a: f((e + 1) / 7), b: f((e - 2) / 3), c: f((e + 2) / 11),
}))}, oracleBlocks, oracleOutput, 0);
assert.deepEqual(Array.from(new Uint32Array(oracleOutput.buffer).subarray(0, 65)), [
  3208882638,3211900763,1063642410,3190515665,3182256170,3207099202,1041224367,
  3202196766,1052453562,3193227138,1063989412,1059526786,3201518902,1045678924,
  3191871398,3184967644,3207438135,1039549872,3202874634,1051775695,3194582873,
  1063650477,1059187854,3202196769,3199420738,3211553759,3187675072,3207777070,
  1036838406,3203552502,1059534854,1070643004,1051646576,1058848920,3202874638,
  3200098607,3211892693,3189030811,3208116001,1034126932,3204230375,1059195922,
  1073225355,1063222776,3181481468,3203552505,3200776476,3212231626,3190386545,
  3208454936,1031032144,3204678248,1058856987,1073055888,1062883843,3206727988,
  3214592057,3201454340,3212570560,3191742279,3208793869,1052518120,1068246258,
  1029999196,1070360558,
]);

const ignored = new Float32Array(64);
applySoundboardOutputKernel({offset: 0, entries: []}, blocks, ignored, 0);
assert.equal(ignored.every((value) => value === 0), true);

assert.throws(() => prepareSoundboardObservations({
  inverseScale: 1, amplitudeScale: 1, frequencies: [NaN],
}), /non-finite/);
assert.throws(() => prepareSoundboardObservations({
  inverseScale: 1, amplitudeScale: 1, frequencies: [1], flags: 1,
}), /coefficient array/);
assert.throws(() => applySoundboardOutputKernel({
  offset: 0, entries: [{stateIndex: 2, a: 0, b: 0, c: 0}],
}, blocks, new Float32Array(128), 0), /State block/);

console.log('PASS soundboard observation records, output kernel and guards');
