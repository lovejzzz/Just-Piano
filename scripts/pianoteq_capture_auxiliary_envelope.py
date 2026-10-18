"""Read-only, alternating auxiliary source entry/post-envelope observations."""
import hashlib,json,traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar,unpack
SITES=(0x100301c8c,0x100460a4c)
voices,profiles,tables={}, {}, {}
inputs,outputs,errors,transitions=[],[],[],[]
pending=None
phase_hooks={}
stream=None

def table(frame,p):
    if not p:return None
    data,count=unpack(frame,p,'QQ')
    if not 0<count<=1000000:raise ValueError('Bounded auxiliary source table required')
    key=hex(p)
    if key not in tables:
        raw=base.memory(frame,data,count*4)
        name='table-'+str(len(tables))+'.bin'
        tables[key]={'file':name,'count':count,'sha256':hashlib.sha256(raw).hexdigest()}
        (base.ROOT/name).write_bytes(raw)
    return key

def source_profile(frame,p):
    count=scalar(frame,p+0x1b8,'I')
    if count>5:raise ValueError('Bounded auxiliary filter cascade required')
    return {'delay':scalar(frame,p+0x1bc,'I'),
      'gain':list(unpack(frame,p+0x30,'ff')),
      'primary':table(frame,scalar(frame,p+0x20,'Q')),
      'secondary':table(frame,scalar(frame,p+0x28,'Q')),
      'filters':[list(unpack(frame,scalar(frame,p+0x50+64*i,'Q'),'I'*36)) for i in range(count)],
      'flags':list(unpack(frame,p+0x1c4,'BB'))}

def envelope(frame,h):
    e=h+0xc9c
    return dict(zip(('period','slope','scale','gain','step','target'),unpack(frame,e,'ffffff')),
      enabled=scalar(frame,e+0x18,'B'),ready=scalar(frame,e+0x19,'B'))


def matrix(frame,p):
    height,capacity,width,pitch=unpack(frame,p,'IIII')
    if not 1<=height<=3 or not height<=capacity<=8 or width!=64 or not 64<=pitch<=8192:raise ValueError('Three complete auxiliary rows required')
    ptr=scalar(frame,p+16,'Q')
    return b''.join(base.memory(frame,ptr+pitch*r*4,256) for r in range(height))

def save():
    if stream:stream.flush()
    terminal=bool(base.run_status and base.run_status.get('terminal'))
    data={'schema':1,'targetMutation':False,'runStatus':base.run_status,'errors':errors,
      'inputs':inputs,'outputs':outputs,'pending':pending,'profiles':profiles,'tables':tables,
      'sites':[hex(x) for x in SITES],'alternatingSites':True,'transitions':transitions,
      'hardwareBreakpoints':2,'activeHardwareBreakpoints':sum(h.IsEnabled() for h in base.hooks),
      'audioBytes':stream.tell() if stream else 0,
      'audioSha256':hashlib.sha256((base.ROOT/'auxiliary.bin').read_bytes()).hexdigest() if terminal else None}
    tmp=base.ROOT/'runtime.json.tmp';tmp.write_text(json.dumps(data,separators=(',',':'),allow_nan=False));tmp.replace(base.ROOT/'runtime.json')

def rotate(a,b):
    if not phase_hooks[a].IsEnabled() or phase_hooks[b].IsEnabled():raise ValueError('Exclusive auxiliary phase required')
    phase_hooks[a].SetEnabled(False);phase_hooks[b].SetEnabled(True)
    transitions.append({'ordinal':len(outputs),'from':hex(a),'to':hex(b)})

def observed(frame,location,_):
    global pending
    try:
        pc=frame.GetPCAddress().GetFileAddress()
        if pc!=location.GetAddress().GetFileAddress() or frame.GetThread().GetIndexID()!=1 or pc not in SITES:raise ValueError('Exact owned auxiliary main-thread site required')
        reg=lambda n:frame.FindRegister(n).GetValueAsUnsigned()
        if pc==SITES[0]:
            if pending is not None:raise ValueError('Overlapping auxiliary source')
            h,p,age=reg('x0')-0xb78,reg('x1'),reg('w2')
            if reg('lr')!=frame.GetThread().GetProcess().GetTarget().ResolveFileAddress(0x10046135c).GetLoadAddress(frame.GetThread().GetProcess().GetTarget()):raise ValueError('Exact auxiliary source caller required')
            if h not in voices:
                if age!=0 or len(voices)>=5:raise ValueError('Five auxiliary voices from zero required')
                voices[h]=len(voices)
            epoch=voices[h]
            if age!=sum(1 for x in inputs if x['epoch']==epoch)*64:raise ValueError('Contiguous auxiliary ages required')
            begin,end=unpack(frame,h+0xb78,'QQ')
            count=scalar(frame,h+0xb90,'I')
            if not 1<=count<=3:raise ValueError('Bounded auxiliary source object count required: '+str((count,begin,end)))
            profile=[source_profile(frame,begin+i*0x1c8) for i in range(count)]
            if epoch not in profiles:profiles[epoch]=profile
            parent=scalar(frame,reg('x29')-0x80,'Q')
            controls={'parentSkip':scalar(frame,parent+0x3c4,'B'),'voiceSkip':scalar(frame,h+0x160,'B'),'voiceFlags':scalar(frame,h+0x2f4c,'B'),'numerator':scalar(frame,h+0x2f28),'denominator':scalar(frame,h+0x2f2c),'quietCounter':scalar(frame,h+0x2ea0,'I'),'quietLimit':scalar(frame,h+0x2e9c,'I'),'quietThreshold':scalar(frame,h+0x2ea4),'auxiliaryMidGain':scalar(frame,h+0x8c),'midLevel':scalar(frame,h+0x9c)}
            inputs.append({'epoch':epoch,'counter':age,'profile':profile,'header':[begin,end,count],'envelope':envelope(frame,h),'controls':controls})
            pending={'voice':h,'matrix':p,'epoch':epoch,'counter':age,'phase':'source'}
            rotate(SITES[0],SITES[1])
        else:
            if pending is None:raise ValueError('Auxiliary return without input')
            if pending['phase']!='source' or reg('x19')!=pending['voice'] or reg('x21')!=pending['matrix']:raise ValueError('Exact source return required')
            raw=matrix(frame,pending['matrix']);stream.write(raw)
            outputs.append({'epoch':pending['epoch'],'counter':pending['counter'],'offset':stream.tell()-len(raw),'bytes':len(raw),'sourceSha256':hashlib.sha256(raw).hexdigest(),'envelope':envelope(frame,pending['voice']),'quietCounter':scalar(frame,pending['voice']+0x2ea0,'I'),'parentSkip':scalar(frame,scalar(frame,reg('x29')-0x80,'Q')+0x3c4,'B')})
            pending=None;rotate(SITES[1],SITES[0])
            if len(outputs)%128==0:save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:hook.SetEnabled(False)
        save();return True

def __lldb_init_module(debugger,_):
    import lldb
    global stream
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    if (base.ROOT/'runtime.json').exists():raise ValueError('Fresh auxiliary capture required')
    stream=(base.ROOT/'auxiliary.bin').open('xb')
    for site in SITES:
        r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address '+hex(site)+' --shlib "Pianoteq 9"',r)
        if not r.Succeeded():raise RuntimeError(r.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetAutoContinue(True);err=hook.SetScriptCallbackFunction(__name__+'.observed')
        if err and err.Fail():raise RuntimeError(str(err))
        hook.SetEnabled(site==SITES[0]);phase_hooks[site]=hook;base.hooks.append(hook)
    base.save=save;save()
