#!/usr/bin/env python3
"""Audit five two-block terminal/modal observations and complete native WAVs.

Consumer-side modal state may lead cached audio. It is never treated as the
producer state of that audio or used to predict it. All commercial data is private.
"""
import argparse
import json
import math
from pathlib import Path
import struct
import wave
from pianoteq_audit_first_dispatch_pair import compare_states, HELPERS as DISPATCH_HELPERS, PRESET
from pianoteq_audit_spatial_native_pair import require, sha, keyed, pcm_compare, RESOURCE, MIDI

COLLECTOR='c9a3c97b672d29490e6bb59f4738b9ebe7f13eccb7af9a514915caa9a0169521'
HELPERS={**DISPATCH_HELPERS,'pianoteq_capture_modal_terminal_boundary.py':COLLECTOR}
FIELDS={'frequency','modalDecay','J','K','S','sinInverse','R','energy','positionWeight','P','Q','A','B'}
KEYS=[(epoch,age) for epoch in range(5) for age in [0,64]]

def validate_inventory(s):
    groups=s['groups'];require(0<len(groups)<=3,'Bounded modal groups required')
    expected=[];end=0
    for i,(start,padded,capacity,logical) in enumerate(groups):
        require(all(type(x) is int for x in [start,padded,capacity,logical]) and end<=start<=start+logical<=padded<=4096 and 0<=logical<=capacity<=4096,'Valid complete modal group layout required')
        expected.extend((i,lane) for lane in range(start,start+logical));end=padded
    require([(r['group'],r['lane']) for r in s['lanes']]==expected,'Entire logical lane inventory required')
    for lane in s['lanes']:
        require(set(lane['words'])==FIELDS,'Exact modal field inventory required')
        require(all(type(v) is int and 0<=v<=0xffffffff for v in lane['words'].values()),'Raw uint32 modal words required')

def validate_state(s):
    validate_inventory(s)
    require(s['initialFlag']==0 and type(s['counter']) is int and s['counter']>=64 and s['counter']%64==0,'Cleared initialization flag and complete internal blocks required')

def load(root):
    root=root.resolve(strict=True);raw=(root/'runtime.json').read_bytes();d=json.loads(raw);launch=json.loads((root/'launch.json').read_text());s=d['runStatus']
    require(s.get('terminal') is True and s.get('state')==10 and s.get('exitStatus')==0,'Actual successful native termination required')
    require(json.loads((root/'wrapper-terminal.json').read_text())=={'terminal':True,'exitStatus':0},'Successful wrapper also required')
    require(d['targetMutation'] is False and not d['errors'] and d['completeFiveTwoBlockOnsets'] is True,'Complete passive onset inventory required')
    require(d['sites']==['0x100460f1c'] and d['hardwareBreakpoints']==1 and d['activeHardwareBreakpoints']==0 and d['hits']>=10,'One fixed retired hardware hook required')
    require(launch['collector']=='pianoteq_capture_modal_terminal_boundary.py' and launch['collectorSha256']==COLLECTOR and launch['helperSha256']==HELPERS,'Exact frozen helper set required')
    for name,digest in HELPERS.items():require(sha((root.parent/name).read_bytes())==digest,'Frozen helper changed')
    f=launch['fixture'];require(f['resourceSha256']==RESOURCE and f['midiSha256']==MIDI and f['selection']['sha256']==PRESET,'Supported immutable fixture required')
    for path,digest in [(f['resourcePath'],RESOURCE),(f['midiPath'],MIDI),(f['selection']['path'],PRESET)]:require(sha(Path(path).read_bytes())==digest,'Native input changed')
    expected=[f['binaryPath'],'--headless','--no-prefs','--multicore','0','--fxp',f['selection']['path'],'--midi',f['midiPath'],'--wav',str(root/'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF'];require(launch['arguments']==expected,'Frozen normal render arguments required')
    resumes=s['ownedResumes'];require(len(resumes)==1 and resumes[0]['initial'] and resumes[0]['threads'] and all(t['reason']==5 and 'SIGSTOP' in t['description'] for t in resumes[0]['threads']),'Only initial SIGSTOP may resume')
    log=(root/'lldb.log').read_text().lower();require(not any(x in log for x in ['traceback','unowned stop','corrupt archive','cannot run','please reinstall']),'Native or collector failure in log')
    require([(r['epoch'],r['counter']) for r in d['records']]==KEYS,'All ten onset blocks without substitution required')
    audio={};voices={}
    for r in d['records']:
        require(r['note']==69 and r['stage']=='terminal','Fixture terminal records required');validate_state(r['state'])
        voices.setdefault(r['epoch'],r['voice']);require(voices[r['epoch']]==r['voice'],'Stable voice identity within each two-block observation required')
        require(set(r['cacheWords'])=={'0x2f78','0x2f7c','0x2f80','0x2f84','0x2f88','0x2f8c','0x2fb4'} and all(type(v) is int and 0<=v<=0xffffffff for v in r['cacheWords'].values()),'Complete raw cache-control observation required')
        main=[t for t in r['threadFrames'] if t['index']==1];require(len(main)==1 and main[0]['frames'][0]['pc']=='0x100460f1c','Exact main-thread observation boundary required')
        file=(root/r['audioFile']).resolve();require(file.parent==root,'Local bound audio required');data=file.read_bytes()
        require(len(data)==r['audioBytes']==768 and sha(data)==r['audioSha256'],'Complete three-row native terminal block required')
        require(all(math.isfinite(v[0]) for v in struct.iter_unpack('<f',data)),'Finite complete terminal audio required');audio[(r['epoch'],r['counter'])]=data
    require(len(set(voices.values()))==5,'Five separately identified native voices required')
    with wave.open(str(root/'observed.wav')) as w:
        fmt={'channels':w.getnchannels(),'sampleWidth':w.getsampwidth(),'sampleRate':w.getframerate(),'frames':w.getnframes()};pcm=w.readframes(w.getnframes())
    require(fmt=={'channels':2,'sampleWidth':3,'sampleRate':48000,'frames':143360} and len(pcm)==143360*6,'Complete supported native WAV required')
    return {'root':str(root),'pid':s['pid'],'runtimeSha256':sha(raw),'fixture':f,'records':d['records'],'audio':audio,'format':fmt,'pcm':pcm}

def state_comparison(a,b):
    # No common-lane cropping when native mode selection/layouts differ.
    same=a['groups']==b['groups']
    return {'layoutEqual':same,'layoutA':a['groups'],'layoutB':b['groups'],'entireObservedStateEqual':a==b,'modalCounterA':a['counter'],'modalCounterB':b['counter'],'initialFlagA':a['initialFlag'],'initialFlagB':b['initialFlag'],'laneComparison':compare_states(a,b) if same else None,'unequalLayoutIsNotEquivalence':True}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('a',type=Path);p.add_argument('b',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    require(not args.output.resolve().is_relative_to(Path(__file__).resolve().parents[1]) and not args.output.exists(),'Fresh private report required')
    a,b=load(args.a),load(args.b);require(a['pid']!=b['pid'] and a['root']!=b['root'] and a['fixture']==b['fixture'],'Distinct successful runs of identical fixture required')
    blocks=[]
    for x,y in zip(a['records'],b['records']):
        blocks.append({'epoch':x['epoch'],'counter':x['counter'],'modal':state_comparison(x['state'],y['state']),'cacheWordsA':x['cacheWords'],'cacheWordsB':y['cacheWords'],'terminalAudioEqual':x['audioSha256']==y['audioSha256']})
    r={'schema':1,'nativeCapturesComplete':True,'onsetObservationIsFullContinuousVoiceCoverage':False,'pidA':a['pid'],'pidB':b['pid'],'runtimeSha256A':a['runtimeSha256'],'runtimeSha256B':b['runtimeSha256'],'blocks':blocks,'terminal':keyed(a['audio'],b['audio'],3),'pcm':pcm_compare(a,b),'producerStatesForCachedBlocksObserved':False,'uniqueCauseEstablished':False,'independentEngineVerified':False,'nativeRepeatabilityExplained':False}
    with args.output.open('x') as f:json.dump(r,f,indent=2);f.write('\n')
    print(json.dumps({k:v for k,v in r.items() if k!='blocks'}))

if __name__=='__main__':main()
