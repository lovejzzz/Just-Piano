#!/usr/bin/env python3
"""Read normal API mappings; save controlled FXPs and render them with normal CLI.
The only presets written under the application directory are uniquely named NEW
user presets. Each is copied to the evidence directory then its exact file removed.
No activation, binary patching, or locked parameter access is performed.
"""
import argparse, json, shutil, subprocess, time, urllib.request, uuid
from pathlib import Path
from importlib.machinery import SourceFileLoader
E=SourceFileLoader('audio_experiment',str(Path(__file__).with_name('pianoteq-audio-experiment.py'))).load_module()
PARAMS=['hammer_hardness_piano','hammer_hardness_mezzo','hammer_hardness_forte','string_length','impedance','impedance_cutoff','q_factor']
def main():
    a=argparse.ArgumentParser();a.add_argument('--out',type=Path,required=True);a.add_argument('--port',type=int,default=8133);args=a.parse_args();args.out.mkdir(parents=True,exist_ok=False)
    bank='Codex Analysis '+str(uuid.uuid4());bankpath=Path.home()/'Library/Application Support/Modartt/Pianoteq/Presets'/bank
    def rpc(method,params=[],port=None):
        req=urllib.request.Request(f'http://127.0.0.1:{port or args.port}/jsonrpc',data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),headers={'Content-Type':'application/json'})
        result=json.load(urllib.request.urlopen(req,timeout=30))
        if 'error' in result:raise RuntimeError(result)
        return result['result']
    logfile=(args.out/'rpc.log').open('w');proc=subprocess.Popen([E.APP,'--headless','--no-prefs','--preset','NY Steinway D Mix','--serve',f'127.0.0.1:{args.port}'],stdout=logfile,stderr=subprocess.STDOUT)
    results={'preset':'NY Steinway D Mix','mappings':{},'audio':{}}
    try:
        for _ in range(100):
            if proc.poll() is not None:raise RuntimeError('RPC process exited')
            try:info=rpc('getInfo');break
            except OSError:time.sleep(.1)
        else:raise RuntimeError('RPC not ready')
        results['info']=info; baseline={p['id']:p for p in rpc('getParameters')};results['baseline_parameters']=list(baseline.values())
        for pid in PARAMS:
            if '(locked)' in baseline[pid]['name']:raise RuntimeError('Locked parameter '+pid)
            results['mappings'][pid]=[]
            for value in [.25,.5,.75]:
                rpc('loadPreset',{'name':results['preset']});rpc('setParameters',{'list':[{'id':pid,'normalized_value':value}]})
                result=next(p for p in rpc('getParameters') if p['id']==pid);results['mappings'][pid].append(result)
        cases=[('baseline',None,None)]+[(pid+'_'+str(v).replace('.','p'),pid,v) for pid in PARAMS for v in [.25,.75]]
        for name,pid,value in cases:
            rpc('loadPreset',{'name':results['preset']})
            if pid:rpc('setParameters',{'list':[{'id':pid,'normalized_value':value}]})
            state=rpc('getParameters');(args.out/(name+'.parameters.json')).write_text(json.dumps(state,indent=2))
            rpc('savePreset',{'name':name,'bank':bank});src=bankpath/(name+'.fxp');dst=args.out/(name+'.fxp');shutil.copy2(src,dst);src.unlink()
            # Confirm serialized state in a fresh process; same-process readback may
            # only expose pending automation when the audio device is stopped.
            verifier=subprocess.Popen([E.APP,'--headless','--no-prefs','--fxp',str(dst),'--serve',f'127.0.0.1:{args.port+1}'],stdout=logfile,stderr=subprocess.STDOUT)
            try:
                for _ in range(100):
                    try: restored=rpc('getParameters',port=args.port+1);break
                    except OSError:time.sleep(.1)
                else:raise RuntimeError('Verifier not ready')
                (args.out/(name+'.restored-parameters.json')).write_text(json.dumps(restored,indent=2))
                if pid:
                    actual=next(p for p in restored if p['id']==pid)
                    if abs(actual['normalized_value']-value)>1e-5:
                        results['audio'][name]={'status':'invalid_saved_parameter','requested':value,'restored':actual}
                        print(name,'SKIPPED: serialized parameter did not change',flush=True)
                        continue
            finally:
                try:rpc('quit',port=args.port+1)
                except Exception:pass
                try:verifier.wait(timeout=10)
                except subprocess.TimeoutExpired:verifier.terminate();verifier.wait(timeout=10)
            # forte/piano knobs are excited at suitable velocities; baseline comparisons
            # use a fresh same-velocity reference in every render group.
            velocity=32 if pid=='hammer_hardness_piano' else 127 if pid=='hammer_hardness_forte' else 96
            mid=args.out/(name+'.mid');wav=args.out/(name+'.wav');E.midi(mid,E.events(velocity=velocity,release=5.5))
            command=[E.APP,'--headless','--no-prefs','--fxp',str(dst),'--midi',str(mid),'--wav',str(wav),'--rate','48000','--bit-depth','16','--dither','OFF']
            run=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120);(args.out/(name+'.log')).write_text(run.stdout);(args.out/(name+'.command.json')).write_text(json.dumps(command,indent=2))
            if run.returncode:raise RuntimeError(run.stdout)
            results['audio'][name]={'velocity':velocity,'measurement':E.measure(wav)};print(name,results['audio'][name],flush=True)
        # Reference held-note captures at each hammer test velocity.
        for velocity in [32,127]:
            name='baseline_v'+str(velocity);mid=args.out/(name+'.mid');wav=args.out/(name+'.wav');E.midi(mid,E.events(velocity=velocity,release=5.5));command=[E.APP,'--headless','--no-prefs','--fxp',str(args.out/'baseline.fxp'),'--midi',str(mid),'--wav',str(wav),'--rate','48000','--bit-depth','16','--dither','OFF'];r=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120);(args.out/(name+'.log')).write_text(r.stdout)
            if r.returncode:raise RuntimeError(r.stdout)
            results['audio'][name]={'velocity':velocity,'measurement':E.measure(wav)}
        (args.out/'measurements.json').write_text(json.dumps(results,indent=2))
    finally:
        (args.out/'partial-results.json').write_text(json.dumps(results,indent=2))
        try:rpc('quit')
        except Exception:pass
        try:proc.wait(timeout=10)
        except subprocess.TimeoutExpired:proc.terminate();proc.wait(timeout=10)
        logfile.close()
        if bankpath.exists() and not any(bankpath.iterdir()):bankpath.rmdir()
if __name__=='__main__':main()
