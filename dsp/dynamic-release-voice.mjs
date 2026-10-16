// Stateful release control for one voice, not a mechanical contact-force model.
// Inputs are model controls and source events; native result snapshots are never inputs.
import {releaseCoefficients} from './physical-controls.mjs';
import {ReleaseProgressEnvelope} from './release-progress-envelope.mjs';
import {initializeReleaseModel} from './release-model-controls.mjs';

export class DynamicReleaseVoice {
 constructor(x) {
  this.model = null;
  this.envelope = new ReleaseProgressEnvelope(0);
  this.coefficients = {duration: 0, rate: 0, gain: 0};
  this.updateRattle(x);
 }
 updateRattle(x) {
  if (!Number.isFinite(x) || x < 0 || x > 1) throw new RangeError('Rattle control must be between zero and one');
  this.x = Math.fround(x);
 }
 initializeModel(sources) {
  if (this.model || this.envelope.blocks) throw new Error('Release model must initialize once before rendering');
  this.model = initializeReleaseModel(sources);
  return {...this.model, polynomial: [...this.model.polynomial]};
 }
 refresh({model = this.model, u, releaseFlag}) {
  if (!Number.isInteger(releaseFlag) || releaseFlag < 0 || releaseFlag > 255) throw new RangeError('Byte release flag required');
  const active = (releaseFlag & 1) !== 0 || this.x > 0;
  this.coefficients = active ? releaseCoefficients({...model, x: this.x, u}) : {duration: 0, rate: 0, gain: 0};
  return {...this.coefficients};
 }
 process({samples, baseDuration = this.model?.polynomial[0], timestep = this.model?.timestep}) {
  return this.envelope.process({samples, baseDuration, timestep, duration: this.coefficients.duration});
 }
 copyRelease() {
  return this.envelope.position;
 }
}
