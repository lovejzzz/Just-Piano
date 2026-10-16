import assert from 'node:assert/strict';
import {rattleDispatchRoute as route} from '../dsp/rattle-dispatch-control.mjs';
import {RattleControlState} from '../dsp/rattle-control-state.mjs';

// Branch destinations from 278154, 4601a0 and 4601ac. Upper flag bits
// must not change the bit-zero tests used by these native branches.
const cases=[
 ['entry',0,null,'skip'],['entry',1,null,'buffer'],
 ['entry',2,null,'skip'],['entry',255,null,'buffer'],
 ['buffer',0,0,'commit'],['buffer',0,1,'skip'],
 ['buffer',1,0,'ready'],['buffer',1,1,'ready'],
 ['ready',0,0,'commit'],['ready',0,1,'skip'],
 ['ready',1,0,'commit'],['ready',1,1,'commit'],
 ['ready',2,1,'skip'],['ready',3,1,'commit'],
];
for(const [kind,flag,multi,expected] of cases)assert.equal(route(kind,flag,multi),expected);
for(const args of [['other',0,0],['entry',0,0],['buffer',0,null],['ready',0,2],['ready',NaN,0],['entry',-1,null]])assert.throws(()=>route(...args));

// A source update whose dispatch is skipped must not advance the modal cache.
const state=new RattleControlState(.25);
state.updateSource(.75);
assert.equal(route('ready',0,1),'skip');
assert.equal(state.current,.75);assert.equal(state.modal,.25);
state.updateSource(.5);
assert.equal(route('ready',1,1),'commit');
assert.equal(state.commitRuntime(),.5);assert.equal(state.modal,.5);
console.log(JSON.stringify({branchCases:cases.length,invalidInputs:6,skippedThenCommitted:true}));
