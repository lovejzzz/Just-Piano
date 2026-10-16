// node SCRIPT base-models.json source-capture.json [report.json]
//   --base-index N --curve-capture curve-capture.json
import fs from 'node:fs';
import { archivePitchSourceControls, velocityScaleFromControls } from '../dsp/pitch-source-controls.mjs';
import { nativeScalarLogf } from '../dsp/native-scalar-log.mjs';
import { nativeScalarExp } from '../dsp/native-scalar-exp.mjs';
const positional = [], args = process.argv.slice(2);
let baseIndex = 0, curvePath;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base-index') baseIndex = Number(args[++i]);
  else if (args[i] === '--curve-capture') curvePath = args[++i];
  else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}`);
  else positional.push(args[i]);
}
const [basePath, sourcePath, reportPath] = positional;
if (!sourcePath || positional.length > 3 || !curvePath)
  throw new Error('Expected base-models source-capture [report], --base-index N and --curve-capture');
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const bases = read(basePath), base = Array.isArray(bases) ? bases[baseIndex] : bases;
if (!base?.fields) throw new Error('Decoded base fields required');
const source = read(sourcePath);
if (source.schema !== 1 || source.point !== '0x10043dff4' || source.errors?.length || !source.records?.length)
  throw new Error('Complete source capture at 43dff4 required');
const view = new DataView(new ArrayBuffer(4));
const bits = x => { view.setFloat32(0,x); return view.getUint32(0).toString(16).padStart(8,'0'); };
const failures = [], checks = [], predictions = [];
function check(name, predicted, actual) {
  if (!Number.isFinite(actual)) throw new Error(`Missing actual ${name}`);
  const same = bits(predicted) === bits(actual);
  checks.push({ name, passed: same });
  if (!same) failures.push({ name, predicted, actual, predictedBits: bits(predicted), actualBits: bits(actual) });
}
let modesVerified = false;
// Optional curve capture support is deliberately schema-strict; archive version
// words must never serve as evidence of runtime interpolation flags.
if (curvePath) {
  const curves = read(curvePath);
  if (curves.schema !== 1 || curves.point !== '0x1001c5f30' || curves.errors?.length || !curves.records?.length) throw new Error('Complete curve capture required');
  const fields = new Map(base.fields.map(row => [row.object_offset, row.value]));
  for (const row of fields.get(0x2f10)?.fields ?? []) fields.set(0x2f10 + row.object_offset, row.value);
  for (const [i, record] of curves.records.entries()) for (const offset of ['0x3a90','0x3ae0']) {
    const curve = record.curves?.[offset], archived = fields.get(Number(offset));
    if (!curve || curve.log_x !== 0 || curve.special_mode !== 0 || curve.dimension !== 1 || !archived)
      throw new Error(`Captured scalar linear-clamp curve required: ${offset}`);
    for (const axis of ['x','y']) {
      if (curve[axis]?.length !== archived[axis].length) throw new Error(`Curve shape differs: ${offset}/${axis}`);
      curve[axis].forEach((value,j) => check(`curve:${i}:${offset}:${axis}:${j}`,archived[axis][j],value));
    }
  }
  for (const [i, record] of curves.records.entries()) {
    const prediction = archivePitchSourceControls({baseFields:base.fields,note:record.note,
      host78:0,host80:0,runtimeCurveMode:'linear-clamp'});
    check(`curve:${i}:baseType`,fields.get(0x158),record.base_type);
    check(`curve:${i}:G1008`,prediction.baseStrength,record.base_strength);
  }
  modesVerified = true;
}
for (const [index, record] of source.records.entries()) {
  const curve = record.velocity_curve;
  if (curve?.log_x !== 0 || curve.special_mode !== 0 || curve.dimension !== 1)
    throw new Error('Actual scalar linear velocity curve required');
  const velocity = velocityScaleFromControls({ host78: record.host['0x78'], hostMode: record.host_mode,
    host2fe0: record.host['0x2fe0'], gA0: record.G_controls['0xa0'], gC0: record.G_controls['0xc0'],
    shared8c: record.shared['0x8c'], shared90: record.shared['0x90'], sharedMode: record.shared_mode,
    velocityCurve: curve, runtimeCurveMode: 'linear-clamp' }, { logf: nativeScalarLogf, expf: nativeScalarExp });
  check(`${index}:H80`,velocity.velocityScale,record.host['0x80']);
  const prediction = archivePitchSourceControls({baseFields:base.fields,note:record.note,
    host78:record.host['0x78'],host80:velocity.velocityScale,runtimeCurveMode:'linear-clamp'});
  check(`${index}:G1008`,prediction.baseStrength,record.G_controls['0x1008']);
  check(`${index}:G100c`,prediction.baseDecay,record.G_controls['0x100c']);
  check(`${index}:V938`,prediction.strength,record.voice['0x938']);
  check(`${index}:V93c`,prediction.decay,record.voice['0x93c']);
  check(`${index}:V940`,prediction.velocityScale,record.voice['0x940']);
  check(`${index}:V934`,Number(prediction.exponentialBranch),record.flags['0x934']);
  check(`${index}:V930`,Number(prediction.initialDisabled),record.flags['0x930']);
  predictions.push({index,note:record.note,prediction,velocity});
}
const report = {schema:'pianoteq-pitch-source-pass21',passed:failures.length===0,records:source.records.length,
  comparedValues:checks.length,mismatches:failures.length,baseModel:base.model_identity,
  runtimeCurvesVerified:modesVerified,
  baseCurveModesVerified:modesVerified,baseCurveModesAssumed:false,nativeMathOracleRequired:false,
  host78AndSharedVelocityControlsStillCaptured:true,sharedModeCovered:[...new Set(source.records.map(r=>r.shared_mode))],
  checks,failures,predictions};
if(reportPath) fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,records:report.records,compared:report.comparedValues,mismatches:report.mismatches,baseCurveModesVerified:modesVerified}));
if(!report.passed) process.exitCode=1;
