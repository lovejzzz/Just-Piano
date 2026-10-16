"""Four fixed hardware observations of owned exact-build voice consumption.
Reads matrices and controls only; never evaluates or writes target expressions.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_recurrence import floats, register

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS = {'queued':0x10046066c, 'cross':0x100460acc,
          'gain':0x100460c84, 'final':0x100460f1c}
DELAY_ONLY = os.environ.get('PIANOTEQ_CONSUMER_DELAY_ONLY') == '1'
FOCUS = os.environ.get('PIANOTEQ_CONSUMER_FOCUS') == '1'
if FOCUS:
    POINTS = {'queued':0x10046066c, 'redistributed':0x1004608bc,
              'enveloped':0x100460a4c, 'cross':0x100460acc}
if DELAY_ONLY:
    POINTS = {'queued':0x10046066c, 'redistributed':0x1004608bc,
              'delayed':0x100460908, 'enveloped':0x100460a4c}
records, errors, hooks, ordinals = [], [], [], {}
window_complete = False
LIMIT = 96


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':window_complete,
        'ordinalLimit':LIMIT,'records':records,'errors':errors,
        'hooks':[{'id':h.GetID(),'hits':h.GetHitCount(),'enabled':h.IsEnabled()} for h in hooks]},indent=2))


def observed(frame, location, _):
    global window_complete
    try:
        if window_complete:return False
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        h=register(frame,'x19'); output=register(frame,'x23')
        if stage=='queued':ordinals[h]=ordinals.get(h,-1)+1
        ordinal=ordinals[h]
        if ordinal>=LIMIT:
            window_complete=True
            for hook in hooks:hook.SetEnabled(False)
            save();return False
        count=scalar(frame,output,'Q');assert 0<count<=8
        groups=[]
        for i in range(count):
            desc=output+8+56*i
            rows,stride,samples,sample_stride=unpack(frame,desc,'IIII')
            ptr=scalar(frame,desc+16,'Q')
            assert rows==1 and samples==64,(stage,rows,samples)
            groups.append({'rows':rows,'stride':stride,'samples':samples,'sampleStride':sample_stride,
                           'pointer':hex(ptr),'values':floats(frame,ptr,samples)})
        controls={hex(o):scalar(frame,h+o) for o in (0x9c,0xa0,0x8c,0x128,0x2908,0x290c,0x2910,0x2914,0x2918,0x2f38)}
        record={'stage':stage,'H':hex(h),'ordinal':ordinal,'workerCounter':scalar(frame,h+0x178,'I'),
                'queueIndices':list(unpack(frame,h+0x2f78,'III')),'thread':frame.GetThread().GetThreadID(),
                'groups':groups,'controls':controls,
                'envelope': {'gain':scalar(frame,h+0xcf0), 'step':scalar(frame,h+0xcf4),
                             'active':scalar(frame,h+0xcfc,'B'), 'elapsed':scalar(frame,h+0xd00,'I'),
                             'duration':scalar(frame,h+0xd04,'I')},
                'flags':{hex(o):scalar(frame,h+o,'B') for o in (0x160,0x1740,0x1918,0x2f4c,0x30b5,0x30b6)},
                'delayCount':scalar(frame,h+0x2b40,'Q')}
        assert record['delayCount']<=8
        record['delays']=[]
        for group in range(record['delayCount']):
            d=h+0x2b48+72*group
            length,elapsed=unpack(frame,d,'II');pointer=scalar(frame,d+0x20,'Q')
            assert length<=8192
            state={'length':length,'elapsed':elapsed,'writeGain':scalar(frame,d+8),
                   'dryGain':scalar(frame,d+12),'smoothing':scalar(frame,d+24,'I'),
                   'words':list(unpack(frame,d,'I'*8))}
            if ordinal in (0,LIMIT-1) and length:
                state['ring']=floats(frame,pointer,length)
            record['delays'].append(state)
        if stage=='queued' and ordinal==0:
            record['stack']=[hex(frame.GetThread().GetFrameAtIndex(i).GetPCAddress().GetFileAddress())
                             for i in range(min(12,frame.GetThread().GetNumFrames()))]
        records.append(record)
        if stage==('enveloped' if DELAY_ONLY else 'cross' if FOCUS else 'final'):save()
        return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    assert not (ROOT/'runtime.json').exists(),'fresh directory required'
    target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
    spec=target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory())/spec.GetFilename())
    for address in POINTS.values():
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        hook.SetScriptCallbackFunction(__name__+'.observed');hooks.append(hook)
    save()
