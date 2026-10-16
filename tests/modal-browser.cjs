// Runs the reconstructed kernel in Chrome's actual AudioWorklet thread.
// The fixture remains private and is supplied explicitly from an authorized
// runtime capture; this is an internal-kernel test, not full piano equivalence.
const fs = require('node:fs');
const { chromium } = require('playwright');
const capturePath = process.argv[2];
if (!capturePath) throw new Error('Usage: node tests/modal-browser.cjs runtime.json [report.json]');
const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
if (!capture.records.length || capture.errors.length) throw new Error('Invalid capture');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(process.env.PIANO_TEST_URL || 'http://localhost:8000/');
    const result = await page.evaluate(async (records) => {
      const moduleURL = new URL('dsp/modal-kernel.mjs', location.href).href;
      const source = `
        import {renderSixteen} from ${JSON.stringify(moduleURL)};
        class Replay extends AudioWorkletProcessor {
          constructor() {
            super(); this.records=[]; this.index=0; this.previous=new Map();
            this.count={records:0,state_components:0,state_bit_mismatches:0,output_samples:0,output_bit_mismatches:0};
            this.word=new DataView(new ArrayBuffer(4));
            this.port.onmessage=e=>{this.records=e.data;};
          }
          bits(v){this.word.setFloat32(0,v,true);return this.word.getUint32(0,true);}
          compare(a,b){if(a.length!==b.length)throw new Error('Length mismatch');let n=0;for(let i=0;i<a.length;i++)n+=this.bits(a[i])!==this.bits(b[i]);return n;}
          process(inputs,outputs) {
            if(this.index>=this.records.length)return true;
            try {
              const r=this.records[this.index++], key=r.thread+':'+r.sp+':'+r.output_pointer, p=this.previous.get(key);
              const continued=p&&r.P_pointer===p.P_pointer+64&&r.Q_pointer===p.Q_pointer+64&&r.coefficient_pointer===p.coefficient_pointer+128&&r.remaining_groups_x11===p.remaining_groups_x11-4;
              const out=continued?Float32Array.from(p.output_after):new Float32Array(r.output_after.length);
              const P=Float32Array.from(r.P_before),Q=Float32Array.from(r.Q_before),A=new Float32Array(16),B=new Float32Array(16);
              for(let g=0;g<4;g++)for(let l=0;l<4;l++){A[g*4+l]=r.coefficients_interleaved[g*8+l];B[g*4+l]=r.coefficients_interleaved[g*8+4+l];}
              renderSixteen(P,Q,A,B,out);
              this.count.records++;this.count.state_components+=32;this.count.output_samples+=out.length;
              this.count.state_bit_mismatches+=this.compare(P,r.P_after)+this.compare(Q,r.Q_after);
              this.count.output_bit_mismatches+=this.compare(out,r.output_after);
              outputs[0][0].set(out.subarray(0,outputs[0][0].length));
              this.previous.set(key,r);
              if(this.index===this.records.length)this.port.postMessage(this.count);
            } catch(e){this.index=this.records.length;this.port.postMessage({error:String(e)});}
            return true;
          }
        }
        registerProcessor('modal-replay-check',Replay);
      `;
      const context = new AudioContext({ sampleRate: 48000 });
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        await context.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(context, 'modal-replay-check', { outputChannelCount: [1] });
        const mute = context.createGain();
        mute.gain.value = 0;
        node.connect(mute).connect(context.destination);
        const complete = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Worklet timeout')), 20000);
          node.port.onmessage = (event) => { clearTimeout(timeout); resolve(event.data); };
          node.onprocessorerror = () => { clearTimeout(timeout); reject(new Error('Worklet processor error')); };
        });
        node.port.postMessage(records);
        await context.resume();
        return await complete;
      } finally {
        URL.revokeObjectURL(url);
        await context.close();
      }
    }, capture.records);
    result.page_errors = pageErrors;
    result.passed = !result.error && !pageErrors.length &&
      result.records === capture.records.length && result.state_bit_mismatches === 0 && result.output_bit_mismatches === 0;
    if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
