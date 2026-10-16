#!/usr/bin/env python3
"""Normal-API, same-session A/B/A save/readback and real 24-bit PCM control.
Requires an explicitly owned --no-prefs GUI with running audio. No debugging,
original-binary changes, user preference changes, or factory-preset writes.
"""
import argparse, hashlib, json, math, shutil, socket, subprocess, time, urllib.request, uuid, wave
from pathlib import Path

APP = '/Applications/Pianoteq 9/Pianoteq 9.app/Contents/MacOS/Pianoteq 9'


def rpc(port, method, params=None):
    request = urllib.request.Request(f'http://127.0.0.1:{port}/jsonrpc',
        data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or []}).encode(),
        headers={'Content-Type':'application/json'})
    result = json.load(urllib.request.urlopen(request, timeout=15))
    if 'error' in result:
        raise RuntimeError(result)
    return result['result']


def owned(port, pid):
    result = subprocess.run(['lsof','-t',f'-iTCP:{port}','-sTCP:LISTEN'], capture_output=True, text=True, check=True)
    if result.stdout.split() != [str(pid)]:
        raise RuntimeError('listener does not match owned process')


def settle(port):
    for _ in range(100):
        if not rpc(port,'getInfo')[0]['computing_parameter_update']:
            time.sleep(3)
            info = rpc(port,'getInfo')[0]
            if not info['computing_parameter_update']:
                return info
        time.sleep(.1)
    raise RuntimeError('parameter update did not settle')


def pcm(path):
    with wave.open(str(path),'rb') as wav:
        meta = {'frames':wav.getnframes(),'rate':wav.getframerate(),'channels':wav.getnchannels(),'width':wav.getsampwidth()}
        assert meta['width']==3 and meta['rate']==48000 and meta['channels']==2, meta
        raw = wav.readframes(meta['frames'])
    values = [int.from_bytes(raw[i:i+3],'little',signed=True) for i in range(0,len(raw),3)]
    meta['sha256'] = hashlib.sha256(raw).hexdigest()
    return meta,values


def compare(left, right):
    a,x=pcm(left); b,y=pcm(right)
    count=min(len(x),len(y)); diffs=[y[i]-x[i] for i in range(count)]
    first=next((i for i,d in enumerate(diffs) if d),None)
    return {'left':a,'right':b,'equal':a==b and x==y,'commonSamples':count,
        'differentSamples':sum(d!=0 for d in diffs),'maxAbsoluteIntegerDifference':max(map(abs,diffs),default=0),
        'rmsDifference':math.sqrt(sum(d*d for d in diffs)/max(1,count))/8388608,
        'firstDifferentFrame':None if first is None else first//2}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid',type=int,required=True);parser.add_argument('--port',type=int,required=True)
    parser.add_argument('--out',type=Path,required=True);parser.add_argument('--midi',type=Path,required=True)
    parser.add_argument('--cwd',type=Path,required=True)
    parser.add_argument('--parameter',default='stereo_width',help='Normal API parameter with initial value .5')
    args=parser.parse_args();owned(args.port,args.pid)
    with socket.socket() as probe:probe.bind(('127.0.0.1',args.port+1))
    out=args.out;out.mkdir(exist_ok=False,parents=True)
    bank='Codex Analysis '+str(uuid.uuid4())
    bankpath=Path.home()/'Library/Application Support/Modartt/Pianoteq/Presets'/bank
    report={'bank':bank,'guiPid':args.pid,'cases':{},'comparisons':{},'complete':False,'parameter':args.parameter}
    def save(): (out/'report.json').write_text(json.dumps(report,indent=2))
    try:
        report['audioDevice']=rpc(args.port,'getAudioDeviceInfo')
        assert report['audioDevice']['status']=='running'
        report['initialParameters']=rpc(args.port,'getParameters')
        initial={p['id']:p['normalized_value'] for p in report['initialParameters']}
        assert abs(initial[args.parameter]-.5)<1e-6
        # No preset reload between saves: A/B/A from the same initial state.
        treatmentName='width25' if args.parameter=='stereo_width' else args.parameter+'25'
        for name,value in [('baseline50_a',.5),(treatmentName,.25),('baseline50_b',.5)]:
            owned(args.port,args.pid)
            rpc(args.port,'setParameters',{'list':[{'id':args.parameter,'normalized_value':value}]})
            case={'requested':value,'committedInfo':settle(args.port),'parameters':rpc(args.port,'getParameters')}
            report['cases'][name]=case;save()
            expected={p['id']:p['normalized_value'] for p in case['parameters']}
            assert expected.keys()==initial.keys()
            case['changedFromInitial']=[k for k in initial if abs(initial[k]-expected[k])>1e-6]
            assert all(k==args.parameter for k in case['changedFromInitial'])
            assert abs(expected[args.parameter]-value)<1e-6
            rpc(args.port,'savePreset',{'name':name,'bank':bank,'preset_type':'full'})
            source=bankpath/(name+'.fxp');dest=out/(name+'.fxp')
            shutil.copy2(source,dest);source.unlink();case['presetSha256']=hashlib.sha256(dest.read_bytes()).hexdigest();save()
        # Save sequence finishes before independent readback and render processes.
        for name,case in report['cases'].items():
            dest=out/(name+'.fxp');command=[APP,'--headless','--no-prefs','--fxp',str(dest),'--serve',f'127.0.0.1:{args.port+1}']
            case['verifyCommand']=command
            with (out/(name+'.verify.log')).open('w') as log:
                process=subprocess.Popen(command,cwd=args.cwd,stdout=log,stderr=subprocess.STDOUT)
                try:
                    for _ in range(100):
                        if process.poll() is not None:raise RuntimeError('verifier exited before ready')
                        try: restored=rpc(args.port+1,'getParameters');break
                        except OSError:time.sleep(.1)
                    else:raise RuntimeError('verifier not ready')
                    owned(args.port+1,process.pid)
                    case['restoredParameters']=restored
                    expected={p['id']:p['normalized_value'] for p in case['parameters']}
                    actual={p['id']:p['normalized_value'] for p in restored}
                    case['inventoryEqual']=expected.keys()==actual.keys()
                    case['readbackMismatches']=[k for k in expected if k not in actual or abs(expected[k]-actual[k])>1e-6]
                    assert case['inventoryEqual'] and not case['readbackMismatches']
                finally:
                    if process.poll() is None:
                        owned(args.port+1,process.pid);rpc(args.port+1,'quit')
                    case['verifyExit']=process.wait(timeout=15);save()
            assert case['verifyExit']==0
            command=[APP,'--headless','--no-prefs','--fxp',str(dest),'--midi',str(args.midi),'--wav',str(out/(name+'.wav')),'--rate','48000','--bit-depth','24','--dither','OFF']
            case['renderCommand']=command;save()
            with (out/(name+'.render.log')).open('w') as log:
                run=subprocess.run(command,cwd=args.cwd,stdout=log,stderr=subprocess.STDOUT,timeout=120)
            case['renderExit']=run.returncode;save();assert run.returncode==0
            case['pcm']=pcm(out/(name+'.wav'))[0];save();print(name,'saved, restored, rendered',flush=True)
        for name,left,right in [('baselineRepeat','baseline50_a','baseline50_b'),('treatment','baseline50_a',treatmentName)]:
            report['comparisons'][name]=compare(out/(left+'.wav'),out/(right+'.wav'))
        report['complete']=True
        report['causalControlPassed']=report['comparisons']['baselineRepeat']['equal']
        save();print(json.dumps({'complete':True,'comparisons':report['comparisons']}),flush=True)
        if not report['causalControlPassed']:
            raise RuntimeError('A/A PCM did not repeat; causal control failed')
    finally:
        save()
        if bankpath.exists() and not any(bankpath.iterdir()):bankpath.rmdir()

if __name__=='__main__':main()
