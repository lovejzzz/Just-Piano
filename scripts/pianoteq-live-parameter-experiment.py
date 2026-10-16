#!/usr/bin/env python3
"""Verify normal Pianoteq GUI parameter persistence and CLI audio.
Requires an OWNED standalone started with --no-prefs --serve 127.0.0.1:PORT,
with a running audio output selected normally in its Devices panel. Does not
start or quit that GUI instance. New preset files use a unique disposable bank.
Requires the numpy environment also used by pianoteq-audio-experiment.py.
"""
import json,urllib.request,time,subprocess,shutil,uuid,sys,socket
from pathlib import Path
from importlib.machinery import SourceFileLoader
E=SourceFileLoader('experiment',str(Path(__file__).with_name('pianoteq-audio-experiment.py'))).load_module()
import wave,numpy as np
def load24(path):
 with wave.open(str(path),'rb') as w:
  assert w.getsampwidth()==3
  b=np.frombuffer(w.readframes(w.getnframes()),np.uint8).reshape(-1,3).astype(np.int32)
  v=b[:,0]|(b[:,1]<<8)|(b[:,2]<<16);v=(v^0x800000)-0x800000
  return v.astype(float).reshape(-1,w.getnchannels())/8388608,w.getframerate()
E.load=load24
import argparse
a=argparse.ArgumentParser();a.add_argument('--out',type=Path,required=True);a.add_argument('--port',type=int,default=8141);args=a.parse_args()
# Refuse an occupied verification port before creating or contacting a verifier.
with socket.socket() as probe:
 probe.bind(('127.0.0.1',args.port+1))
out=args.out;out.mkdir(parents=True,exist_ok=False)
bank='Codex Analysis '+str(uuid.uuid4());bankpath=Path.home()/'Library/Application Support/Modartt/Pianoteq/Presets'/bank
PARAMS=['hammer_hardness_piano','hammer_hardness_mezzo','hammer_hardness_forte','string_length','impedance','impedance_cutoff','q_factor','damper_position','damping_duration']
def rpc(m,p=[],port=args.port):
 r=json.load(urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/jsonrpc',data=json.dumps({'jsonrpc':'2.0','id':1,'method':m,'params':p}).encode(),headers={'Content-Type':'application/json'}),timeout=30))
 if 'error' in r:raise RuntimeError(r)
 return r['result']
def ready(port,process):
 for _ in range(100):
  if process.poll() is not None:raise RuntimeError('verifier exited before readiness')
  try:return rpc('getParameters',port=port)
  except OSError:time.sleep(.1)
 raise RuntimeError('not ready')
def settle(pid=None,v=None):
 for _ in range(100):
  i=rpc('getInfo')[0]
  if not i['computing_parameter_update'] and (pid is None or i['modified']):
   time.sleep(3);return rpc('getInfo')[0]
  time.sleep(.1)
 raise RuntimeError('not committed')
results={'bank':bank,'cases':{},'initial_audio_device':rpc('getAudioDeviceInfo')}
assert results['initial_audio_device']['status']=='running'
try:
 for name,pid,v in [('baseline',None,None)]+[(p+'_'+str(v),p,v) for p in PARAMS for v in [.25,.75]]:
  rpc('loadPreset',{'name':'NY Steinway D Mix'});settle()
  if pid:
   current=next(x for x in rpc('getParameters') if x['id']==pid)
   assert '(locked)' not in current['name']
   rpc('setParameters',{'list':[{'id':pid,'normalized_value':v}]})
  info=settle(pid,v);params=rpc('getParameters');rpc('savePreset',{'name':name,'bank':bank,'preset_type':'full'})
  src=bankpath/(name+'.fxp');dst=out/(name+'.fxp');shutil.copy2(src,dst);src.unlink()
  command=[E.APP,'--headless','--no-prefs','--fxp',str(dst),'--serve',f'127.0.0.1:{args.port+1}']
  with (out/(name+'.verify.log')).open('w') as log:
   verifier=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
   try:
    restored=ready(args.port+1,verifier)
    (out/(name+'.restored.json')).write_text(json.dumps(restored,indent=2))
    expected={x['id']:x['normalized_value'] for x in params}
    actual={x['id']:x['normalized_value'] for x in restored}
    assert expected.keys()==actual.keys(), 'parameter inventory changed'
    assert all(abs(actual[k]-expected[k])<1e-6 for k in expected), 'saved parameter state differs'
    if pid:assert abs(next(x for x in restored if x['id']==pid)['normalized_value']-v)<1e-5, (pid,v,next(x for x in restored if x['id']==pid))
   finally:
    try:
     if verifier.poll() is None:rpc('quit',port=args.port+1)
    except OSError:pass
    verifier.wait(timeout=15)
  case={'parameter':pid,'requested':v,'committed_info':info,'parameters':params,'restored_parameters':restored,'verify_command':command,'verify_exit':verifier.returncode,'renders':{}}
  assert verifier.returncode==0
  velocities=[32,96,127] if pid is None else [32 if pid=='hammer_hardness_piano' else 127 if pid=='hammer_hardness_forte' else 96]
  for vel in velocities:
   n=name+'_v'+str(vel);mid=out/(n+'.mid');wav=out/(n+'.wav');E.midi(mid,E.events(velocity=vel,release=5.5))
   command=[E.APP,'--headless','--no-prefs','--fxp',str(dst),'--midi',str(mid),'--wav',str(wav),'--rate','48000','--bit-depth','24','--dither','OFF']
   run=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120);(out/(n+'.log')).write_text(run.stdout)
   assert run.returncode==0,run.stdout
   case['renders'][str(vel)]={'command':command,'measurement':E.measure(wav)}
  results['cases'][name]=case;(out/'results.json').write_text(json.dumps(results,indent=2));print(name,'PASS',flush=True)
finally:
 (out/'results.json').write_text(json.dumps(results,indent=2))
 if bankpath.exists() and not any(bankpath.iterdir()):bankpath.rmdir()
