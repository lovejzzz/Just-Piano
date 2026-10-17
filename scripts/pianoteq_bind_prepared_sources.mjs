// Bind pass139's computed tables without treating its observed RNG as independent.
import crypto from 'node:crypto';
import {ExcitationManagerRandom} from '../dsp/excitation-manager-random.mjs';
import {nextExcitationRandom} from '../dsp/final-excitation.mjs';
import {computeNoteOnVelocitySource} from './pianoteq_note_on_velocity_source.mjs';
const names = ['frequency', 'decay', 'amplitude', 'phase'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function bindPreparedSources(bytes, captureSha256) {
  const report = JSON.parse(bytes);
  const forwardRandom = report.primaryInitialRandomStateIndependentlyProduced === true && report.primaryRandomStateStillObserved === false;
  const observedRandom = report.primaryRandomStateStillObserved === true && report.primaryInitialRandomStateIndependentlyProduced === false;
  const computedVelocity=report.eventVelocityComputedFromMidiAndArchive===true;
  if(!computedVelocity && (report.eventVelocitySource || report.eventVelocityPredictions))
    throw new Error('Computed velocity payload requires explicit dependency metadata');
  if (!report.passed || !report.compatible || report.mismatches !== 0 || report.comparedValues !== 2160 ||
      report.captureSha256 !== captureSha256 || !report.bindingAuditOnly || !report.compatibleWithCapturedContextOnly ||
      !report.amplitudeMixComputedFromArchive || !report.neighborControlsComputedFromArchive ||
      !report.decayControlsComputedFromArchive || !report.frequencyVariationComputedFromArchive ||
      (!forwardRandom && !observedRandom) ||
      report.sameRunModelGenerationVerified !== false || report.finalStereoVerified !== false || report.substitutedIntoVoice !== false ||
      report.correctionFitApplied !== false || report.checks?.length !== 10)
    throw new Error('Complete capture-bound computed source report with explicit observed dependencies required');
  if (report.neighborNativeAtan2fImplemented === true && (report.neighborSystemMathRequired !== false ||
      report.neighborNativeHypotfImplemented !== true || report.neighborMathCalls?.length !== 0))
    throw new Error('Native neighbor math metadata contradicts external dependencies');
  if (forwardRandom && (report.managerConfigurationSeedSupplied !== 0 || report.managerEventBranchSupplied !== 'velocity-randomization-enabled' ||
      report.managerDraws !== 10 || report.randomStateComparedWords !== 20 || report.randomStateMismatches !== 0 ||
      report.managerRuntimeConditionsNewlyObserved !== false || report.managerRandomStateChecks?.length !== 5))
    throw new Error('Explicit manager reset conditions and complete integer-state comparisons required');
  const manager = forwardRandom ? new ExcitationManagerRandom({configurationSeed: 0, eventBranch: 'velocity-randomization-enabled'}) : undefined;
  const velocitySource=computedVelocity?computeNoteOnVelocitySource(report.eventVelocitySource):undefined;
  const velocityStarts=new Set();
  if(computedVelocity){
    if(!forwardRandom || report.velocityMismatches!==0 || report.velocityComparedValues!==15 ||
        report.velocityChecks?.length!==15 || report.eventVelocityRuntimeConditionsNewlyObserved!==false ||
        report.eventVelocityTableSha256!==velocitySource.tableSha256 ||
        JSON.stringify(report.eventVelocityPredictions)!==JSON.stringify(velocitySource.events))
      throw new Error('Complete recomputable event velocity source and explicit conditions required');
    const owners=new Set();
    for(const check of report.velocityChecks){
      const key=`${check.epoch}:${check.stage}:${check.mode??''}`,event=velocitySource.events[check.epoch];
      if(!event || owners.has(key) || !['before','weights'].includes(check.stage) ||
          (check.stage==='weights'?![0,1].includes(check.mode):check.mode!==undefined) ||
          check.bitEqual!==true || !Object.is(check.predicted,event.velocity) || !Object.is(check.actual,event.velocity))
        throw new Error('Distinct exact event velocity comparison boundaries required');
      owners.add(key);
    }
  }
  const primaryRandomStates = new Map();
  const entries = new Map(), used = new Set();
  let count = 0;
  for (const row of report.checks) {
    const key = `${row.epoch}:${row.mode}`, size = row.rows * row.columns;
    if (!Number.isInteger(row.epoch) || row.epoch < 0 || row.epoch > 4 || ![0, 1].includes(row.mode) || entries.has(key) ||
        !Number.isInteger(row.rows) || row.rows < 1 || row.columns !== 3 || !row.predictedSource)
      throw new Error('Unique complete prepared-source epochs and modes required');
    for (const name of names) {
      const values = row.predictedSource[name], check = row.arrays?.[name];
      if (!Array.isArray(values) || values.length !== size || !values.every(Number.isFinite) ||
          check?.compared !== size || check.mismatches !== 0 || check.perColumn?.length !== 3 || check.perColumn.some(n => n !== 0))
        throw new Error('Complete finite compared source arrays required');
      const raw = Buffer.alloc(size * 4);
      values.forEach((x, i) => raw.writeFloatLE(x, i * 4));
      if (sha(raw) !== check.predictionSha256) throw new Error('Prepared source prediction digest mismatch');
      count += size;
    }
    entries.set(key, row);
    if (manager && row.mode === 0) {
      const initialization = manager.nextVoice(), state = [...initialization.voiceState], draws = Math.ceil(size / 4) * 4;
      if(computedVelocity && JSON.stringify(initialization)!==JSON.stringify(velocitySource.events[row.epoch]?.initialization))
        throw new Error('Forward event velocity and source manager states differ');
      if (initialization.ordinal !== row.epoch || row.frequencyVariation?.randomDraws !== draws ||
          initialization.voiceState.some((x, i) => x !== row.frequencyVariation.initialRandomState?.[i]))
        throw new Error('Prepared manager initialization differs from forward construction');
      for (let i = 0; i < draws; i++) nextExcitationRandom(state);
      const check = report.managerRandomStateChecks.find(r => r.epoch === row.epoch);
      if (!check || check.mismatches !== 0 || state.some((x, i) => x !== row.frequencyVariation.randomState?.[i] || x !== check.predicted?.[i] || x !== check.actual?.[i]))
        throw new Error('Prepared manager post-jitter integer state mismatch');
      primaryRandomStates.set(row.epoch, state);
    }
  }
  if (count !== report.comparedValues) throw new Error('Prepared source coverage count mismatch');
  return {
    metadata: {reportSha256: sha(bytes), captureSha256, tables: entries.size, comparedValues: count,
      crossRunHistoricalBridge: true, sameRunModelGenerationVerified: false,
      primaryRandomStateStillObserved: !forwardRandom, primaryInitialRandomStateIndependentlyProduced: forwardRandom,
      managerConditionsSupplied: forwardRandom ? {configurationSeed: 0, eventBranch: 'velocity-randomization-enabled', newlyObserved: false} : undefined,
      neighborSystemMathRequired: report.neighborSystemMathRequired,
      neighborNativeHypotfImplemented: report.neighborNativeHypotfImplemented === true,
      neighborNativeAtan2fImplemented: report.neighborNativeAtan2fImplemented === true,
      eventVelocityComputedFromMidiAndArchive:computedVelocity,
      eventVelocityRuntimeConditionsNewlyObserved:false,
      eventVelocityConditionsSupplied:computedVelocity?report.eventVelocitySource.conditions:undefined,
      eventVelocityMidiSha256:computedVelocity?report.eventVelocitySource.midiSha256:undefined,
      runtimeBranchSupplied: report.decayRuntimeBranchSupplied, wholeEngineEquivalent: false},
    consume(record) {
      const key = `${record.epoch}:${record.input.mode}`, row = entries.get(key);
      if (!row || used.has(key) || row.columns !== record.input.header[0] || row.rows !== record.input.header[1] || record.input.size !== row.rows * row.columns)
        throw new Error('Unmatched, reused or differently shaped prepared source');
      used.add(key);
      return Object.fromEntries(names.map(name => [name, [...row.predictedSource[name]]]));
    },
    primaryRandomState(record) {
      const state = primaryRandomStates.get(record.epoch);
      if (record.input.mode !== 0 || !state || !used.has(`${record.epoch}:0`)) throw new Error('Consumed forward source state required');
      return [...state];
    },
    beginVelocity(record){
      const event=velocitySource?.events[record.epoch];
      if(!event || record.stage!=='before' || record.note!==event.note || record.epoch!==velocityStarts.size || velocityStarts.has(record.epoch))
        throw new Error('Unique chronological MIDI voice start required');
      velocityStarts.add(record.epoch);return event.velocity;
    },
    velocityForEpoch(epoch){
      if(!velocityStarts.has(epoch))throw new Error('Started computed velocity required');
      return velocitySource.events[epoch].velocity;
    },
    verifyComplete() {
      if (used.size !== entries.size) throw new Error('Unconsumed prepared source tables');
      if(computedVelocity && velocityStarts.size!==5)throw new Error('Unconsumed MIDI velocity starts');
      return used.size;
    },
  };
}
