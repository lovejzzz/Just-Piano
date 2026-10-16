"""Observe the global output route and final sum with four read-only hardware points."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_key_routes import cache
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1006c2ac4,'route':0x1006c2fd4,'read':0x1006c300c,'sum':0x1006c301c}
LIMIT=160
records,errors,hooks=[],[],[]
contexts,ordinals={},{}
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
    global complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='entry':
            r=register(frame,'x0');ordinals[r]=ordinals.get(r,-1)+1
            if ordinals[r]>=LIMIT:
                complete=True
                for hook in hooks:hook.SetEnabled(False)
                save();return False
            contexts[thread]={'R':r,'S':scalar(frame,r+0x50,'Q'),'output':register(frame,'x1'),
                              'B':register(frame,'x2'),'ordinal':ordinals[r]}
        c=contexts[thread];s=c['S'];r=c['R'];b=c['B']
        record={'stage':stage,'ordinal':c['ordinal'],'R':hex(r),'S':hex(s),'output':matrix(frame,c['output']),
                'sumInput':matrix(frame,s+0x118),
                'controls':{hex(o):scalar(frame,s+o) for o in (0x1c,0x24,0x28,0x110,0x114)},
                'flags':{hex(o):scalar(frame,s+o,'B') for o in (0x10c,0x10d,0x329,0x368)},
                'rowCounts':{hex(o):scalar(frame,s+o,'I') for o in (0x108,0x3bc,0x3c0)}}
        if stage=='entry':
            record['workspace']={hex(o):matrix(frame,b+o) for o in (0x120,0x158,0x190,0x1c8,0x200,0x238)}
            begin,end=unpack(frame,b+0x270,'QQ');assert end>=begin and (end-begin)%104==0 and (end-begin)//104<=8
            record['groups']=[matrix(frame,a) for a in range(begin,end,104)]
        if stage in ('route','read'):
            record['cache']=cache(frame,s+0x2c8)
        if stage=='route':
            mapping=s+0x288;begin,end=unpack(frame,mapping,'QQ')
            assert end>=begin and (end-begin)%96==0 and (end-begin)//96<=128
            entries=[]
            for a in range(begin,end,96):
                src,dst=unpack(frame,a,'II');n=scalar(frame,a+8,'Q');assert n<=3
                entries.append({'source':src,'destination':dst,'tapWords':list(unpack(frame,a+16,'I'*(n*6)))})
            record.update(entries=entries,wrap=scalar(frame,mapping+24,'B'),gain=regfloat(frame,'s0','f'))
        records.append(record)
        if stage=='sum':save()
        return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    assert not (ROOT/'runtime.json').exists()
    target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
    spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
    for address in POINTS.values():
        result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetScriptCallbackFunction(__name__+'.observed');hooks.append(hook)
    save()
