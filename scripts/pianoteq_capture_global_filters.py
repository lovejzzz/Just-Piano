"""Read-only global auxiliary sum and the two 660974 filter banks."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'global':0x1001bb9ac,'filter':0x1001bbd40,'globalReturn':0x1001bbd44,'channelReturn':0x1001bbd60}
LIMIT=160
records,errors,hooks=[],[],[]
contexts,ordinals,pending={},{},{}
complete=False


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def filter_state(frame,root,row):
    c=scalar(frame,root+8,'Q')+row*0xb0
    begin,end=unpack(frame,c+0x30,'QQ');assert end>=begin and (end-begin)%16==0
    sections=(end-begin)//16;assert sections<=32
    return {'root':hex(root),'row':row,'sections':sections,'gain':scalar(frame,c+0x10),
            'updating':scalar(frame,c+0x14,'B'),'fast':scalar(frame,root+0x24,'B'),
            'gainWords':list(unpack(frame,c,'I'*6)),
            'coefficients':floats(frame,begin,sections*4) if sections else [],
            'table':floats(frame,scalar(frame,c+0x88,'Q'),sections*32) if sections else [],
            'history':floats(frame,scalar(frame,c+0x60,'Q'),sections*4) if sections else []}


def observed(frame,location,_):
    global complete
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='global':
            m=register(frame,'x19');ordinals[m]=ordinals.get(m,-1)+1
            if ordinals[m]>=LIMIT:
                complete=True
                for h in hooks:h.SetEnabled(False)
                save();return False
            a=scalar(frame,m+0xc08,'Q');b=scalar(frame,a+0x2f0,'Q');r=scalar(frame,m+0xe00,'Q');s=scalar(frame,r+0x50,'Q')
            contexts[thread]={'ordinal':ordinals[m],'M':m,'output':register(frame,'x22')}
            records.append({'stage':stage,'ordinal':ordinals[m],'M':hex(m),'output':matrix(frame,register(frame,'x22')),
                            'auxiliary':matrix(frame,b+0x120),'maskEnabled':scalar(frame,s+0x3b8,'B'),
                            'otherMixEnabled':scalar(frame,s+0x3b9,'B')})
        elif stage=='filter':
            caller=POINTS['globalReturn']
            c=contexts[thread];root=register(frame,'x0');row=register(frame,'x3');n=register(frame,'x2');ptr=register(frame,'x1');assert n==64 and row<8
            pending[thread]={'ordinal':c['ordinal'],'root':root,'row':row,'pointer':ptr,'count':n,'bank':'global' if caller==POINTS['globalReturn'] else 'channel'}
            records.append({'stage':'before','ordinal':c['ordinal'],'bank':pending[thread]['bank'],'row':row,
                            'input':floats(frame,ptr,n),'filter':filter_state(frame,root,row)})
        elif stage=='channelReturn':
            c=contexts[thread];records.append({'stage':'postFilter','ordinal':c['ordinal'],'output':matrix(frame,c['output'])});save()
        else:
            c=pending.pop(thread,None)
            if c is None:return False
            assert c['bank']==('global' if stage=='globalReturn' else 'channel')
            records.append({'stage':'after','ordinal':c['ordinal'],'bank':c['bank'],'row':c['row'],
                            'output':floats(frame,c['pointer'],c['count']),'filter':filter_state(frame,c['root'],c['row'])})
            if c['row']==2:save()
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
