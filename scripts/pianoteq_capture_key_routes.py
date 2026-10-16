"""Hardware/read-only key routing maps and actual cache readback matrices."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'key':0x10051fad4,'route':0x1002bf88c,'readEntry':0x10059db68,'readReturn':0x10059dc40}
records,errors,hooks=[],[],[]
caches,ordinals,pending={},{},{}
LIMIT=96
complete=False
current=-1


def save():
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def cache(frame,root):
    begin,end=unpack(frame,root,'QQ');assert end>=begin and (end-begin)%80==0
    count=(end-begin)//80;assert count<=16
    out={'root':hex(root),'sampleRate':scalar(frame,root+24),'maximumDelay':scalar(frame,root+28),'rings':[]}
    for i in range(count):
        r=begin+80*i
        cb,ce=unpack(frame,r+8,'QQ');fb,fe=unpack(frame,r+0x20,'QQ')
        assert ce>=cb and (ce-cb)%40==0 and (ce-cb)//40<=128
        assert fe>=fb and (fe-fb)%2==0 and (fe-fb)//2<=128
        out['rings'].append({'smallChunk':scalar(frame,r+0x38,'I'),'bigChunk':scalar(frame,r+0x3c,'I'),
            'total':scalar(frame,r+0x44,'I'),'head':scalar(frame,r+0x48,'I'),
            'flags':list(unpack(frame,fb,'H'*((fe-fb)//2)))})
    return out


def observed(frame,location,_):
    global complete,current
    try:
        stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        if stage=='key':
            h,b=register(frame,'x3'),register(frame,'x2');ordinals[h]=ordinals.get(h,-1)+1;current=ordinals[h]
            if current>=LIMIT:
                complete=True
                for hook in hooks:hook.SetEnabled(False)
                save();return False
            roots=[('aux',b+0x2d0)]
            start,end=unpack(frame,b+0x270,'QQ');assert end>=start and (end-start)%104==0
            count=(end-start)//104;assert count<=16
            roots.extend((f'group{i}',start+i*104+56) for i in range(count))
            for label,root in roots:
                if root not in caches:caches[root]={'label':label,'seed':cache(frame,root)}
            n=scalar(frame,h+0x100,'Q');assert n<=16
            records.append({'stage':'key','ordinal':current,'H':hex(h),'B':hex(b),'selectionMask':list(unpack(frame,h+0x108,'I'*n))})
        elif stage=='route':
            root=register(frame,'x0')
            if root not in caches:return False
            mapping=register(frame,'x1');source=register(frame,'x2')
            start,end=unpack(frame,mapping,'QQ');assert end>=start and (end-start)%96==0
            n=(end-start)//96;assert n<=128
            entries=[]
            for i in range(n):
                a=start+i*96;src,dst=unpack(frame,a,'II');nt=scalar(frame,a+8,'Q');assert nt<=3
                entries.append({'source':src,'destination':dst,'tapWords':list(unpack(frame,a+16,'I'*(nt*6)))})
            records.append({'stage':'route','ordinal':current,'label':caches[root]['label'],'root':hex(root),
                'cache':cache(frame,root),'seed':caches[root]['seed'] if current==0 else None,
                'gain':regfloat(frame,'s0','f'),'wrap':scalar(frame,mapping+24,'B'),
                'entries':entries,'source':matrix(frame,source)})
        elif stage=='readEntry':
            root=register(frame,'x0');pending[thread]=None
            if root not in caches:return False
            dest=register(frame,'x1')
            pending[thread]={'stage':'read','ordinal':current,'label':caches[root]['label'],'root':hex(root),
                'beforeCache':cache(frame,root),'destinationAddress':dest,'before':matrix(frame,dest),
                'add':register(frame,'w2')}
        else:
            record=pending.get(thread)
            if not record:return False
            root=int(record['root'],16)
            record['afterCache']=cache(frame,root);record['after']=matrix(frame,record.pop('destinationAddress'))
            records.append(record);pending[thread]=None;save()
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
