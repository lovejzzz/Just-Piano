#!/usr/bin/env python3
"""Audit two complete passive terminal/spatial captures; never renders a model.

Commercial profiles/audio and the fresh report must remain outside the repository.
Keyed common-block comparisons are localization evidence, not cropped acceptance.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import wave

SITES=['0x100460f1c','0x10085ede4']
RESOURCE='d8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d'
MIDI='efdde00ca65bcd7d04e8aa3906066ea4fe87fd8d94a70af76bcf7b89f40a6e67'
COLLECTOR='0ebe623cfd67831d1cda991e103ee18769ee95bf756e1af92a995100c1c5c9bf'
HELPERS={'pianoteq_capture_voice_spatial_pair.py':COLLECTOR,
 'pianoteq_capture_soundboard_responses.py':'cabe67e2027a38c4444521880b32237d6c5ae9d6f94d525f2218f66a131e25ca',
 'pianoteq_capture_soundboard_state.py':'d23fd6c7583544f0d8a0217a017af7c3e2d5dad79b524396abe5f398594e5384',
 'pianoteq_damper_runtime_capture.py':'f23c1422c74b69752d9d1ffe5c6c04fa7a3b80c4f4d75489c9bcacb3515a3c20'}
sha=lambda b:hashlib.sha256(b).hexdigest()

def require(ok,message):
    if not ok: raise ValueError(message)

def load(root):
    root=root.resolve(strict=True);runtime=(root/'runtime.json').read_bytes();d=json.loads(runtime)
    launch=json.loads((root/'launch.json').read_text());state=d.get('runStatus') or {}
    require(state.get('terminal') and state.get('state')==10 and state.get('exitStatus')==0,'Native process must have exited successfully')
    require(d.get('targetMutation') is False and not d['errors'] and d['pending'] is None,'Complete error-free passive capture required')
    require(d['sites']==SITES and d['hardwareBreakpoints']==2 and d['activeHardwareBreakpoints']==1 and d['alternatingSites'] is True,'Exact two-site alternating capture required')
    require(launch['collector']=='pianoteq_capture_voice_spatial_pair.py' and launch['collectorSha256']==COLLECTOR,'Pinned passive collector required')
    require(launch['helperSha256']==HELPERS,'Pinned complete helper set required')
    for name,digest in launch['helperSha256'].items():
        f=(root.parent/name).resolve();require(f.parent==root.parent and sha(f.read_bytes())==digest,'Frozen local helper changed')
    fixture=launch['fixture'];require(fixture['resourceSha256']==RESOURCE and fixture['midiSha256']==MIDI,'Supported resource and MIDI required')
    for file,digest in [(fixture['resourcePath'],RESOURCE),(fixture['midiPath'],MIDI),(fixture['selection']['path'],fixture['selection']['sha256'])]:
        require(sha(Path(file).read_bytes())==digest,'Bound native input changed')
    expected=[fixture['binaryPath'],'--headless','--no-prefs','--multicore','0','--fxp',fixture['selection']['path'],'--midi',fixture['midiPath'],'--wav',str(root/'observed.wav'),'--rate','48000','--bit-depth','24','--dither','OFF']
    require(launch['arguments']==expected,'Normal frozen render arguments required')
    log=(root/'lldb.log').read_text();require(not any(x in log.lower() for x in ['could not read','corrupt archive','please reinstall','cannot run']),'Native preset loading failed')
    resumes=state['ownedResumes'];require(len(resumes)==1 and resumes[0]['initial'] and bool(resumes[0]['threads']) and all(t['reason']==5 and 'SIGSTOP' in t['description'] for t in resumes[0]['threads']),'Only the normal initial launch stop may be resumed')
    wrapper=json.loads((root/'wrapper-terminal.json').read_text());require(wrapper=={'terminal':True,'exitStatus':0},'Terminal successful wrapper required in addition to native exit')
    streams={}
    for role in ['source','target']:
        file=(root/d[role+'File']).resolve();require(file.parent==root,'Local audio sidecar required');raw=file.read_bytes()
        require(len(raw)==d[role+'Bytes'] and sha(raw)==d[role+'Sha256'],'Complete bound audio sidecar required')
        require(all(math.isfinite(v[0]) for v in struct.iter_unpack('<f',raw)),'Finite native float audio required');streams[role]=raw
    require(len(d['inputs'])==len(d['outputs']) and 0<len(d['inputs'])<=20000,'Every terminal block needs one returned spatial record')
    require(len(d['phaseTransitions'])==2*len(d['inputs']),'Complete alternating phase inventory required')
    for j,t in enumerate(d['phaseTransitions']):
        require(t=={'ordinal':j//2+j%2,'from':SITES[j%2],'to':SITES[1-j%2]},'Contiguous exclusive capture phases required')
    sources={};targets={};last={};targetOffset=0
    for i,(a,b) in enumerate(zip(d['inputs'],d['outputs'])):
        epoch,age=a['epoch'],a['counter'];key=(epoch,age)
        require(epoch in range(5) and age==last.get(epoch,-64)+64 and key not in sources,'Five counter-zero contiguous voice epochs required');last[epoch]=age
        require(a['ordinal']==i and a['offset']==i*1536 and a['bytes']==1536,'Complete six-row terminal block required')
        data=streams['source'][a['offset']:a['offset']+a['bytes']];require(sha(data)==a['sha256'],'Bound terminal block required');sources[key]=data
        require(all(b[k]==a[k] for k in ['epoch','counter']) and b['inputOrdinal']==i and b['ordinal']==i,'Same-call spatial predecessor required')
        if b['willRoute']:
            require(b['nativeAge']==age+64 and b['offset']==targetOffset and b['bytes']==3328,'Complete thirteen-row spatial block required')
            data=streams['target'][targetOffset:targetOffset+3328];require(sha(data)==b['sha256'],'Bound spatial block required');targets[key]=data;targetOffset+=3328
    require(set(d['profiles'])=={str(i) for i in range(5)},'Complete initial spatial profile inventory required')
    require(set(last)==set(range(5)) and len(streams['source'])==len(sources)*1536 and targetOffset==len(streams['target']),'Full voice and stream extents required')
    with wave.open(str(root/'observed.wav'),'rb') as w:
        fmt={'channels':w.getnchannels(),'sampleWidth':w.getsampwidth(),'sampleRate':w.getframerate(),'frames':w.getnframes()};pcm=w.readframes(w.getnframes())
    require(fmt['channels']==2 and fmt['sampleWidth']==3 and fmt['sampleRate']==48000 and fmt['frames']>0 and len(pcm)==fmt['frames']*6,'Complete native stereo24/48k WAV required')
    return {'root':str(root),'pid':state['pid'],'runtimeSha256':sha(runtime),'fixture':fixture,'sources':sources,'targets':targets,'profiles':d['profiles'],'order':[(x['epoch'],x['counter']) for x in d['inputs']],'format':fmt,'pcm':pcm}

def keyed(a,b,rows):
    common=sorted(a.keys()&b.keys());differences=0;first=None;perRow=[0]*rows
    for epoch,counter in common:
        x,y=a[(epoch,counter)],b[(epoch,counter)];require(len(x)==len(y)==rows*256,'Complete same-layout rows required')
        for i,(u,v) in enumerate(zip(struct.iter_unpack('<I',x),struct.iter_unpack('<I',y))):
            if u!=v:
                differences+=1;perRow[i//64]+=1
                if first is None:first={'epoch':epoch,'counter':counter,'row':i//64,'sample':i%64,'wordA':hex(u[0]),'wordB':hex(v[0])}
    return {'inventoryEqual':a.keys()==b.keys(),'blocksA':len(a),'blocksB':len(b),'commonBlocks':len(common),'missingInA':[list(k) for k in sorted(b.keys()-a.keys())],'missingInB':[list(k) for k in sorted(a.keys()-b.keys())],'samplesComparedOnCommonBlocks':len(common)*rows*64,'differingFloatSamples':differences,'perRowDifferingSamples':perRow,'firstMismatch':first}

def pcm_compare(a,b):
    x,y=a['pcm'],b['pcm'];r={'formatA':a['format'],'formatB':b['format'],'sha256A':sha(x),'sha256B':sha(y),'completePcmEqual':x==y,'completeExtentEqual':len(x)==len(y)}
    if len(x)==len(y):
        count=maximum=0;first=None
        for i in range(0,len(x),3):
            u=int.from_bytes(x[i:i+3],'little',signed=True);v=int.from_bytes(y[i:i+3],'little',signed=True)
            if u!=v:count+=1;maximum=max(maximum,abs(u-v));first=i//6 if first is None else first
        r.update(differingInterleavedSamples=count,maximumIntegerDifference=maximum,firstDifferenceFrame=first)
    return r

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('a',type=Path);p.add_argument('b',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    repo=Path(__file__).resolve().parents[1];require(not args.output.resolve().is_relative_to(repo) and not args.output.exists(),'Fresh private report required')
    a,b=load(args.a),load(args.b);require(a['pid']!=b['pid'] and a['root']!=b['root'],'Distinct successful native runs required');require(a['fixture']==b['fixture'],'Identical frozen native fixture required')
    orderDifferences=[i for i,(x,y) in enumerate(zip(a['order'],b['order'])) if x!=y]
    r={'schema':1,'terminalOrderDifferingPositionsOnCommonExtent':len(orderDifferences),'firstTerminalOrderMismatch':orderDifferences[0] if orderDifferences else None,'nativeCapturesComplete':True,'runtimeSha256A':a['runtimeSha256'],'runtimeSha256B':b['runtimeSha256'],'pidA':a['pid'],'pidB':b['pid'],'fixture':a['fixture'],'chronologicalTerminalOrderEqual':a['order']==b['order'],'initialSpatialProfilesEqual':a['profiles']==b['profiles'],'terminal':keyed(a['sources'],b['sources'],6),'spatial':keyed(a['targets'],b['targets'],13),'pcm':pcm_compare(a,b),'commonBlockComparisonsAreLocalizationOnly':True,'globalControlsAndStatesObserved':False,'contributionOrderObserved':False,'uniqueCauseEstablished':False,'independentEngineVerified':False,'nativeRepeatabilityExplained':False}
    with args.output.open('x') as f:json.dump(r,f,indent=2);f.write('\n')
    print(json.dumps({k:v for k,v in r.items() if k!='fixture'}))

if __name__=='__main__':main()
