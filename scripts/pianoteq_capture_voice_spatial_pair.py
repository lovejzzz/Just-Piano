"""Two fixed passive sites: terminal mono groups -> returned voice endpoints.

All observed audio/profiles remain private. No target writes or exception resume.
"""
import hashlib,json,struct,traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar,unpack,memory

SITES=(0x100460f1c,0x10085ede4)
inputs,outputs,unrendered,errors=[],[],[],[]
voices,last,profiles={}, {}, {}
pending=None
phase_hooks={}
transitions=[]
source_stream=target_stream=None


def matrix(frame,p,height):
    h,capacity,width,pitch=unpack(frame,p,'IIII')
    if h!=height or not h<=capacity<=8 or width!=64 or not width<=pitch<=8192:
        raise ValueError('Complete bounded row-major matrix required')
    ptr=scalar(frame,p+16,'Q')
    return b''.join(memory(frame,ptr+4*pitch*r,256) for r in range(h))


def spatial(frame,h,initial=False):
    proc=h+0x2a00;first,end=unpack(frame,proc+0x68,'QQ')
    if end<first or (end-first)%72 or not 3<=(end-first)//72<=16:raise ValueError('Bounded spatial row bank required')
    rows=[]
    for i in range(3):
        p=first+i*72;begin,finish=unpack(frame,p,'QQ')
        if finish-begin!=80:raise ValueError('Five packed taps required')
        floats,vectors=unpack(frame,p+0x20,'QQ')
        if floats!=vectors*4 or not 1<=vectors<=2048 or vectors&(vectors-1):raise ValueError('Bounded power-of-two spatial ring required')
        raw=memory(frame,scalar(frame,p+0x18,'Q'),floats*4)
        row={'vectors':vectors,'counter':scalar(frame,p+0x40,'I'),'ringSha256':hashlib.sha256(raw).hexdigest()}
        if initial:row.update(tapWords=list(unpack(frame,begin,'I'*20)),ringAllPositiveZero=not any(raw))
        rows.append(row)
    result={'availableRows':(end-first)//72,'rows':rows,'fadeCounter':scalar(frame,proc+0xc0,'I'),
        'inputCounters':list(unpack(frame,proc+0xd0,'III')),'outputCounters':list(unpack(frame,proc+0xe8,'III'))}
    config={'fraction':scalar(frame,h+0x94),'otherFraction':scalar(frame,h+0x98),
        'monoNonlinearity':scalar(frame,h+0x29f8),'auxNonlinearity':scalar(frame,h+0x29fc),
        'flags':{hex(o):scalar(frame,proc+o,'B') for o in (0x88,0xb0,0xbc,0xbd,0xfc)},
        'fade':{'start':scalar(frame,proc+0xb4),'duration':scalar(frame,proc+0xb8),'secondsPerSample':scalar(frame,proc+0xf8)},
        'sleepThreshold':scalar(frame,proc+0xc4,'I')}
    count=scalar(frame,h+0xc8,'Q')
    if not 0<=count<=16:raise ValueError('Bounded spatial gain metadata required')
    config['rowGainMetadataCount']=count
    config['rowGainWords']=list(unpack(frame,h+0xd0,'III'))
    result['configuration']=config
    return result


def save():
    for s in (source_stream,target_stream):
        if s:s.flush()
    terminal=bool(base.run_status and base.run_status.get('terminal'))
    data={'schema':1,'runStatus':base.run_status,'targetMutation':False,'hardwareBreakpoints':2,
        'errors':errors,'pending':pending,'inputs':inputs,'outputs':outputs,'unrenderedReturns':unrendered,
        'profiles':profiles,'sites':[hex(x) for x in SITES],
        'activeHardwareBreakpoints':sum(h.IsEnabled() for h in base.hooks),'alternatingSites':True,'phaseTransitions':transitions,
        'unrenderedExitCallsObserved':False}
    for role,s,name in [('source',source_stream,'terminal-audio.bin'),('target',target_stream,'voice-audio.bin')]:
        data[role+'File']=name;data[role+'Bytes']=s.tell() if s else 0
        data[role+'Sha256']=hashlib.sha256((base.ROOT/name).read_bytes()).hexdigest() if terminal else None
    tmp=base.ROOT/'runtime.json.tmp';tmp.write_text(json.dumps(data,separators=(',',':'),allow_nan=False));tmp.replace(base.ROOT/'runtime.json')


def rotate(source,destination):
    if not phase_hooks[source].IsEnabled() or phase_hooks[destination].IsEnabled():raise ValueError('Exclusive passive spatial phase required')
    phase_hooks[source].SetEnabled(False);phase_hooks[destination].SetEnabled(True)
    transitions.append({'ordinal':len(outputs),'from':hex(source),'to':hex(destination)})


def observed(frame,location,_):
    global pending
    try:
        pc=frame.GetPCAddress().GetFileAddress()
        if pc!=location.GetAddress().GetFileAddress() or frame.GetThread().GetIndexID()!=1 or pc not in SITES:
            raise ValueError('Exact owned main-thread spatial site required')
        reg=lambda name:frame.FindRegister(name).GetValueAsUnsigned()
        if pc==SITES[0]:
            if pending is not None:raise ValueError('One returned voice per terminal input required')
            h,b,aux=reg('x19'),reg('x23'),reg('x21');age=scalar(frame,h+0x6c,'I')
            if h not in voices:
                if age!=0 or len(voices)>=5:raise ValueError('Five counter-zero terminal starts required')
                voices[h]=len(voices)
            epoch=voices[h]
            if age!=last.get(epoch,-64)+64 or scalar(frame,b,'Q')!=3 or aux!=b+0xb0:raise ValueError('Contiguous actual terminal source required')
            state=spatial(frame,h,epoch not in profiles)
            if epoch not in profiles:profiles[epoch]=state
            raw=b''.join(matrix(frame,b+8+56*i,1) for i in range(3))+matrix(frame,aux,3)
            row={'ordinal':len(inputs),'epoch':epoch,'counter':age,'offset':source_stream.tell(),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'spatial':state}
            source_stream.write(raw);inputs.append(row);last[epoch]=age
            pending={'voice':h,'workspace':b,'epoch':epoch,'counter':age,'inputOrdinal':row['ordinal']}
            rotate(SITES[0],SITES[1])
        else:
            h,b=reg('x21'),reg('x20');flag=reg('w0');forced=scalar(frame,h+0x2ec0,'I');route=bool(flag&1 or forced)
            if pending is None:
                if route:raise ValueError('Routed exit without terminal source')
                unrendered.append({'voice':hex(h),'nativeAge':scalar(frame,h+0x6c,'I'),'returnFlag':flag,'forcedActive':forced})
                return False
            if h!=pending['voice'] or b!=pending['workspace']:raise ValueError('Same returned voice/workspace required')
            row={k:v for k,v in pending.items() if k not in ('voice','workspace')}
            row.update(ordinal=len(outputs),nativeAge=scalar(frame,h+0x6c,'I'),willRoute=route,returnFlag=flag,forcedActive=forced,spatial=spatial(frame,h))
            if route:
                if row['nativeAge']!=row['counter']+64:raise ValueError('Actual routed sample age required')
                raw=b''.join(matrix(frame,b+8+56*i,3) for i in range(3))+matrix(frame,b+0xb0,3)+matrix(frame,b+0xe8,1)
                row.update(offset=target_stream.tell(),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest());target_stream.write(raw)
            outputs.append(row);pending=None;rotate(SITES[1],SITES[0])
            if len(outputs)%128==0:save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for h in base.hooks:h.SetEnabled(False)
        save();return True


def __lldb_init_module(debugger,_):
    import lldb
    global source_stream,target_stream
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    if (base.ROOT/'runtime.json').exists():raise ValueError('Fresh spatial capture required')
    source_stream=(base.ROOT/'terminal-audio.bin').open('xb');target_stream=(base.ROOT/'voice-audio.bin').open('xb')
    for site in SITES:
        r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address '+hex(site)+' --shlib "Pianoteq 9"',r)
        if not r.Succeeded():raise RuntimeError(r.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetAutoContinue(True);err=hook.SetScriptCallbackFunction(__name__+'.observed')
        if err and err.Fail():raise RuntimeError(str(err))
        hook.SetEnabled(site==SITES[0]);phase_hooks[site]=hook;base.hooks.append(hook)
    base.save=save;save()
