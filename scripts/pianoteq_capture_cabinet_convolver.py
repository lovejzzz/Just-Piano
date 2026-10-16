"""Read-only CABN entry, convolver core/head, and returned audio window."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1001bbce0,'core':0x1000ef37c,'head':0x100853aa0,'returned':0x1001bbce4}
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
            assert register(frame,'x1')==0x4341424e
            m=register(frame,'x19');ordinals[m]=ordinals.get(m,-1)+1
            if ordinals[m]>=LIMIT:
                complete=True
                for h in hooks:h.SetEnabled(False)
                save();return False
            contexts[thread]={'ordinal':ordinals[m],'source':register(frame,'x2'),'output':register(frame,'x3')}
        c=contexts.get(thread)
        if c is None:return False
        r={'stage':stage,'ordinal':c['ordinal']}
        if stage in ('entry','returned'):
            r.update(source=matrix(frame,c['source']),output=matrix(frame,c['output']))
        elif stage=='core':
            node=register(frame,'x1')
            if scalar(frame,node+4,'I')!=0x4341424e:return False
            c['node']=node
            r.update(node=hex(node),add=register(frame,'x4'),source=matrix(frame,register(frame,'x2')),
                     output=matrix(frame,register(frame,'x3')),inputLevel=list(unpack(frame,node+0x30,'fffI')),
                     tailLength=scalar(frame,node+0x158,'Q'),nodeWords=list(unpack(frame,node,'Q'*48)) if c['ordinal']==0 else None)
        else:
            if 'node' not in c or register(frame,'x0')!=c['node']+0xb8:return False
            root=scalar(frame,register(frame,'x0'),'Q');nb=scalar(frame,root+0x38,'Q');assert nb<=6
            banks=unpack(frame,root+8,'Q'*nb)
            r.update(root=hex(root),add=register(frame,'x3'),source=matrix(frame,register(frame,'x1')),
                     output=matrix(frame,register(frame,'x2')),banks=[{'root':hex(b),'words':list(unpack(frame,b,'Q'*22))} for b in banks])
        records.append(r)
        if stage=='returned':save()
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
