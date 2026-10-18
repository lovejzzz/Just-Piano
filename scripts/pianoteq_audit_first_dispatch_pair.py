#!/usr/bin/env python3
"""Compare passive first-dispatch snapshots and full native WAVs.

Raw coefficient storage may precede initialization. Differences are observations,
not proof that those words are consumed or cause an audible difference.
"""
import argparse
import json
from pathlib import Path
import wave
from pianoteq_audit_spatial_native_pair import require, sha, pcm_compare, RESOURCE, MIDI, HELPERS as SPATIAL_HELPERS

COLLECTOR='49b96e44b90433ea26ef22bca14bfd127ece978881295881d50e81192f7db16c'
HELPERS={k:v for k,v in SPATIAL_HELPERS.items() if k!='pianoteq_capture_voice_spatial_pair.py'}
HELPERS['pianoteq_capture_first_modal_block.py']=COLLECTOR
PRESET='cf9f6852a2a8b3cb712fe091a8f3d015b74ce436f91bb280529fd1a2b0700776'

def compare_states(a,b):
    require(a.keys()==b.keys(),'Same snapshot schema required')
    for state in [a,b]:
        expected=[(i,lane) for i,(start,_,_,logical) in enumerate(state['groups']) for lane in range(start,start+logical)]
        require([(x['group'],x['lane']) for x in state['lanes']]==expected,'Full logical modal inventory required')
    require(a['groups']==b['groups'],'Identical modal layout required')
    counts={};first={};compared=0
    for x,y in zip(a['lanes'],b['lanes']):
        require(x['words'].keys()==y['words'].keys(),'Identical raw-word inventory required')
        for name,u in x['words'].items():
            v=y['words'][name];require(type(u) is int and type(v) is int and 0<=u<=0xffffffff and 0<=v<=0xffffffff,'Raw uint32 storage required');compared+=1
            if u!=v:
                counts[name]=counts.get(name,0)+1
                first.setdefault(name,{'group':x['group'],'lane':x['lane'],'wordA':hex(u),'wordB':hex(v)})
    return {'logicalLanes':len(a['lanes']),'rawWordsCompared':compared,'differentRawWordsByField':counts,'firstDifferenceByField':first,'nonLaneMetadataEqual':{k:a[k]==b[k] for k in a if k!='lanes'},'rawStorageInitializationAndConsumptionProven':False}

def load(root):
    root=root.resolve(strict=True);raw=(root/'runtime.json').read_bytes();d=json.loads(raw);launch=json.loads((root/'launch.json').read_text());s=d['runStatus']
    require(s.get('terminal') is True and s.get('state')==10 and s.get('exitStatus')==0,'Actual successful native termination required')
    require(json.loads((root/'wrapper-terminal.json').read_text())=={'terminal':True,'exitStatus':0},'Wrapper success also required')
    require(d['targetMutation'] is False and not d['errors'] and d['completeFirstDispatch'] is True,'Complete passive dispatch capture required')
    require(d['sites']==['0x100472f50'] and d['hardwareBreakpoints']==1 and d['activeHardwareBreakpoints']==0 and d['oneActivePhase'] is True,'One fixed retired hardware hook required')
    require(d['phase']==1 and d['phaseHits']==[1] and d['phaseTransitions']==[{'from':0,'to':1,'active':0}] and not d['unmatchedDispatchPointers'],'Exactly one first-dispatch observation required')
    require(len(d['records'])==1 and d['records'][0]['stage']=='dispatch' and d['records'][0]['note']==69,'First note69 dispatch required')
    state=d['records'][0]['state'];require(state['counter']==0 and state['initialFlag']==1,'Pre-initialized counter-zero state required')
    require(launch['helperSha256']==HELPERS and launch['collectorSha256']==COLLECTOR and launch['collector']=='pianoteq_capture_first_modal_block.py','Exact frozen helper set required')
    for name,digest in HELPERS.items():require(sha((root.parent/name).read_bytes())==digest,'Frozen helper changed')
    f=launch['fixture'];require(f['resourceSha256']==RESOURCE and f['midiSha256']==MIDI and f['selection']['sha256']==PRESET,'Supported bound fixture required')
    for path,digest in [(f['resourcePath'],RESOURCE),(f['midiPath'],MIDI),(f['selection']['path'],PRESET)]:require(sha(Path(path).read_bytes())==digest,'Native input changed')
    expected=[f['binaryPath'],'--headless','--no-prefs','--multicore','0','--fxp',f['selection']['path'],'--midi',f['midiPath'],'--wav',str(root/'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF'];require(launch['arguments']==expected,'Frozen native render arguments required')
    resumes=s['ownedResumes'];require(len(resumes)==1 and resumes[0]['initial'] and resumes[0]['threads'] and all(t['reason']==5 and 'SIGSTOP' in t['description'] for t in resumes[0]['threads']),'Only initial SIGSTOP may resume')
    log=(root/'lldb.log').read_text().lower();require(not any(x in log for x in ['traceback','unowned stop','corrupt archive','cannot run','please reinstall']),'Native or collector failure in log')
    with wave.open(str(root/'observed.wav')) as w:
        fmt={'channels':w.getnchannels(),'sampleWidth':w.getsampwidth(),'sampleRate':w.getframerate(),'frames':w.getnframes()};pcm=w.readframes(w.getnframes())
    require(fmt=={'channels':2,'sampleWidth':3,'sampleRate':48000,'frames':143360} and len(pcm)==143360*6,'Complete supported native WAV required')
    return {'root':str(root),'pid':s['pid'],'runtimeSha256':sha(raw),'fixture':f,'state':state,'pcm':pcm,'format':fmt}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('a',type=Path);p.add_argument('b',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    require(not args.output.resolve().is_relative_to(Path(__file__).resolve().parents[1]) and not args.output.exists(),'Fresh private output required')
    a,b=load(args.a),load(args.b);require(a['pid']!=b['pid'] and a['root']!=b['root'] and a['fixture']==b['fixture'],'Distinct runs of identical fixture required')
    report={'schema':1,'nativeCapturesComplete':True,'pidA':a['pid'],'pidB':b['pid'],'runtimeSha256A':a['runtimeSha256'],'runtimeSha256B':b['runtimeSha256'],'dispatch':compare_states(a['state'],b['state']),'pcm':pcm_compare(a,b),'sameRunInitializerAndTerminalPairObserved':False,'uniqueCauseEstablished':False,'independentEngineVerified':False,'nativeRepeatabilityExplained':False}
    with args.output.open('x') as f:json.dump(report,f,indent=2);f.write('\n')
    print(json.dumps(report))

if __name__=='__main__':main()
