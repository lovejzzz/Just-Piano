#!/usr/bin/env python3
"""Validate same-call producer snapshots and exact producer/consumer audio binding.

The first two onset blocks are a diagnostic inventory, never full continuous synthesis.
No native snapshot or audio in this auditor is an independent prediction input.
"""
import argparse
import json
import math
from pathlib import Path
import struct
import wave
from pianoteq_audit_modal_cache_onsets import validate_inventory, validate_state
from pianoteq_audit_first_dispatch_pair import HELPERS as SNAPSHOT_HELPERS, PRESET
from pianoteq_audit_spatial_native_pair import require, sha, pcm_compare, keyed, RESOURCE, MIDI

COLLECTOR='c5b8bab0ff811e04ceb89479a07ee30befa38f6c9bf497c501e25adca3555a8a'
HELPERS={**SNAPSHOT_HELPERS,'pianoteq_capture_producer_consumer_onsets.py':COLLECTOR}
SITES=['0x10020b28c','0x10020b438','0x1004604cc']
CALLERS={'cache':'0x100416778','direct':'0x1004604cc'}


def bind(records,audio,required_voices=5):
    produced={};consumed={};epochs={};serials=set()
    for r in records:
        stage=r['stage'];require(stage in ['produced','consumed'],'Known observation stage required')
        key=(r['voice'],r['counter']);require(r['counter'] in [0,64],'First two blocks only')
        target=produced if stage=='produced' else consumed;require(key not in target,'No duplicate stage key');target[key]=r
        if stage=='produced':
            require(r['path'] in CALLERS and r['caller']==CALLERS[r['path']],'Actual known producer caller required')
            require(r['entrySerial']<r['exitSerial'] and r['entryThreadIndex']==r['exitThreadIndex'],'Same non-reentrant producer thread/call required')
            require(r['before']['counter']==r['counter'] and r['after']['counter']==r['counter']+64,'One complete native modal step required')
            validate_inventory(r['before']);validate_state(r['after'])
            require(r['before']['initialFlag'] in [0,1],'Raw observed initialization flag required')
            values=[r['entrySerial'],r['exitSerial']]
        else:
            require(r['threadIndex']==1,'Main-thread consumer required')
            if r['voice'] not in epochs:require(r['counter']==0,'Counter-zero consumer birth required');epochs[r['voice']]=len(epochs)
            values=[r['serial']]
        require(all(type(x) is int and x>0 and x not in serials for x in values),'Unique increasing event coordinates required');serials.update(values)
    expected={(voice,age) for voice in epochs for age in [0,64]}
    require(len(epochs)==required_voices and set(produced)==set(consumed)==expected,'Complete requested voice and two-block stage inventories required')
    count=0;first=None;bound={};inventory=[]
    for voice,epoch in epochs.items():
        for age in [0,64]:
            key=(voice,age);p,c=produced[key],consumed[key]
            require(p['exitSerial']<c['serial'],'Produced block must precede consumption')
            x,y=audio[p['audioFile']],audio[c['audioFile']];require(len(x)==len(y)==768,'Complete three-row blocks required')
            different=sum(u!=v for u,v in zip(struct.iter_unpack('<I',x),struct.iter_unpack('<I',y)))
            if different and first is None:first={'epoch':epoch,'counter':age}
            count+=different;bound[(epoch,age)]=p
            inventory.append({'epoch':epoch,'counter':age,'path':p['path'],'producerThreadIndex':p['entryThreadIndex'],'producerEntryMode':p['entryMode'],'differingSamples':different})
    return {'blocks':len(expected),'samplesCompared':len(expected)*192,'differingSamples':count,'firstMismatch':first,'exactBindingVerified':count==0,'inventory':inventory},bound


def load(root):
    root=root.resolve(strict=True);raw=(root/'runtime.json').read_bytes();d=json.loads(raw);launch=json.loads((root/'launch.json').read_text());s=d['runStatus']
    require(s.get('terminal') is True and s.get('state')==10 and s.get('exitStatus')==0,'Actual successful native termination required')
    require(json.loads((root/'wrapper-terminal.json').read_text())=={'terminal':True,'exitStatus':0},'Successful wrapper also required')
    require(d['targetMutation'] is False and not d['errors'] and not d['pending'] and d['completeFirstVoiceTwoBlockBinding'] is True,'Complete passive call inventory required')
    require(d['sites']==SITES and d['hardwareBreakpoints']==3 and d['activeHardwareBreakpoints']==0 and d['allThreads'] is True,'Three retired fixed all-thread sites required')
    require(launch['collector']=='pianoteq_capture_producer_consumer_onsets.py' and launch['collectorSha256']==COLLECTOR and launch['helperSha256']==HELPERS,'Exact frozen helper set required')
    for name,digest in HELPERS.items():require(sha((root.parent/name).read_bytes())==digest,'Frozen helper changed')
    f=launch['fixture'];require(f['resourceSha256']==RESOURCE and f['midiSha256']==MIDI and f['selection']['sha256']==PRESET,'Supported immutable fixture required')
    for path,digest in [(f['resourcePath'],RESOURCE),(f['midiPath'],MIDI),(f['selection']['path'],PRESET)]:require(sha(Path(path).read_bytes())==digest,'Native input changed')
    expected=[f['binaryPath'],'--headless','--no-prefs','--multicore','0','--fxp',f['selection']['path'],'--midi',f['midiPath'],'--wav',str(root/'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF'];require(launch['arguments']==expected,'Frozen normal render arguments required')
    resumes=s['ownedResumes'];require(len(resumes)==1 and resumes[0]['initial'] and resumes[0]['threads'] and all(t['reason']==5 and 'SIGSTOP' in t['description'] for t in resumes[0]['threads']),'Only initial SIGSTOP may resume')
    log=(root/'lldb.log').read_text().lower();require(not any(x in log for x in ['traceback','unowned stop','corrupt archive','cannot run','please reinstall']),'Native or collector failure in log')
    audio={}
    for r in d['records']:
        file=(root/r['audioFile']).resolve();require(file.parent==root and file.name not in audio,'Distinct local audio sidecars required');data=file.read_bytes()
        require(len(data)==r['audioBytes']==768 and sha(data)==r['audioSha256'],'Complete bound three-row audio required')
        require(all(math.isfinite(v[0]) for v in struct.iter_unpack('<f',data)),'Finite native audio required');audio[file.name]=data
    require(len(d['records'])==4,'All four first-voice stage observations required');binding,produced=bind(d['records'],audio,required_voices=1)
    with wave.open(str(root/'observed.wav')) as w:
        fmt={'channels':w.getnchannels(),'sampleWidth':w.getsampwidth(),'sampleRate':w.getframerate(),'frames':w.getnframes()};pcm=w.readframes(w.getnframes())
    require(fmt=={'channels':2,'sampleWidth':3,'sampleRate':48000,'frames':143360} and len(pcm)==143360*6,'Complete supported native WAV required')
    return {'root':str(root),'pid':s['pid'],'runtimeSha256':sha(raw),'fixture':f,'binding':binding,'produced':produced,'audio':audio,'format':fmt,'pcm':pcm}


def compare_producers(a,b):
    require(a.keys()==b.keys(),'Complete same producer inventory required')
    report=[]
    for key in sorted(a):
        x,y=a[key],b[key]
        report.append({'epoch':key[0],'counter':key[1],'pathA':x['path'],'pathB':y['path'],'entryModeA':x['entryMode'],'entryModeB':y['entryMode'],'beforeModalEqual':x['before']==y['before'],'beforeVoiceControlsEqual':x['beforeControls']==y['beforeControls'],'afterModalEqual':x['after']==y['after'],'afterVoiceControlsEqual':x['afterControls']==y['afterControls'],'producedAudioEqual':x['audioSha256']==y['audioSha256']})
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('a',type=Path);p.add_argument('b',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    require(not args.output.resolve().is_relative_to(Path(__file__).resolve().parents[1]) and not args.output.exists(),'Fresh private report required')
    a,b=load(args.a),load(args.b);require(a['pid']!=b['pid'] and a['root']!=b['root'] and a['fixture']==b['fixture'],'Distinct successful runs of identical fixture required')
    sourceA={k:a['audio'][r['audioFile']] for k,r in a['produced'].items()};sourceB={k:b['audio'][r['audioFile']] for k,r in b['produced'].items()}
    r={'schema':1,'nativeCapturesComplete':True,'fullContinuousVoiceCoverage':False,'pidA':a['pid'],'pidB':b['pid'],'runtimeSha256A':a['runtimeSha256'],'runtimeSha256B':b['runtimeSha256'],'bindingA':a['binding'],'bindingB':b['binding'],'producers':compare_producers(a['produced'],b['produced']),'producedAudio':keyed(sourceA,sourceB,3),'pcm':pcm_compare(a,b),'uniqueCauseEstablished':False,'independentEngineVerified':False,'newPredictionDependenciesRemoved':0}
    with args.output.open('x') as f:json.dump(r,f,indent=2);f.write('\n')
    print(json.dumps({k:v for k,v in r.items() if k not in ['producers','bindingA','bindingB']}))

if __name__=='__main__':main()
