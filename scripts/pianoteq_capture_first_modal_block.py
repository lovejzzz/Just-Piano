"""One fixed passive site: first primary modal dispatch.

The hook retires after the first dispatch snapshot; native
rendering continues normally. No writes, expressions, stepping or exception resume.
"""
import hashlib,json,struct,traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar,unpack
SITES=[0x100472f50]
hooks=[];records=[];errors=[];transitions=[];owner=None;manager=None;phase=0
phase_hits=[0];unmatched_dispatches=[]
CONTROL_OFFSETS=[0xc,0x780,0x784,0x7b0,0x7e0,0x7e4,0x7e8,0x7ec,0x7f0,0x7f4,0x7f8,0x7fc,0x800,0x804,0x810,0x814,0x8c4,0x8c8,0x8cc,0x8d4,0x908,0x90c,0x910,0x914,0x918,0x91c,0x920,0x944,0x948,0x94c,0x950,0x954,0x958]

def save():
    d={'schema':1,'runStatus':base.run_status,'targetMutation':False,'sites':[hex(x) for x in SITES],
       'hardwareBreakpoints':len(SITES),'activeHardwareBreakpoints':sum(h.IsEnabled() for h in hooks),'oneActivePhase':True,
       'phase':phase,'completeFirstDispatch':phase==len(SITES),'records':records,'errors':errors,'phaseTransitions':transitions,
       'phaseHits':phase_hits,'unmatchedDispatchPointers':unmatched_dispatches,
       'scope':'first primary dispatch only; initializer and terminal audio not observed'}
    temporary=base.ROOT/'runtime.json.tmp';temporary.write_text(json.dumps(d,separators=(',',':'),allow_nan=False));temporary.replace(base.ROOT/'runtime.json')

def modal(frame,h):
    v=h+0x168;o=scalar(frame,v,'Q');count=scalar(frame,o+0xa8,'Q')
    if not 0<count<=3:raise ValueError('Bounded primary modal group layout required')
    groups=[list(unpack(frame,o+0xb0+16*i,'IIII')) for i in range(count)]
    if not all(0<=r[0]<=r[0]+r[3]<=4096 for r in groups):raise ValueError('Bounded logical modal lanes required')
    hi=max((r[0]+r[3]+3)//4*4 for r in groups)
    if not 0<hi<=4096:raise ValueError('Nonempty bounded modal state required')
    pointers={name:scalar(frame,v+off,'Q') for name,off in {'frequency':0x20,'modalDecay':0x48,'J':0x1b0,'K':0xe8,'S':0x110,'sinInverse':0x138,'R':0x160,'energy':0x188,'positionWeight':0x788}.items()}
    pointers.update(P=scalar(frame,o+0x58,'Q'),Q=scalar(frame,o+0x80,'Q'))
    arrays={name:struct.unpack('<'+'I'*hi,base.memory(frame,p,hi*4)) for name,p in pointers.items()}
    coefficients=struct.unpack('<'+'I'*(2*hi),base.memory(frame,scalar(frame,o+8,'Q'),8*hi))
    lanes=[]
    for group,(start,_,_,logical) in enumerate(groups):
        for lane in range(start,start+logical):
            index=lane//4*8+lane%4
            lanes.append({'group':group,'lane':lane,'words':{**{name:a[lane] for name,a in arrays.items()},'A':coefficients[index],'B':coefficients[index+4]}})
    return {'counter':scalar(frame,v+0x10,'I'),'initialFlag':scalar(frame,v+0x18,'B'),
      'inputMode':scalar(frame,o+0xf0,'I'),'energyLayout':scalar(frame,o+0xe4,'I'),'groups':groups,'lanes':lanes,
      'controlWords':{hex(off):scalar(frame,v+off,'I') for off in CONTROL_OFFSETS},
      'flags':{hex(off):scalar(frame,v+off,'B') for off in [0x718,0x80c,0x924,0x925,0x926]},
      'voiceWords':{hex(off):scalar(frame,h+off,'I') for off in [0x78,0x7c,0x2f20,0x2f24,0x2f38,0x2fe4,0x2fe8,0x2fec]}}

def rotate():
    global phase
    hooks[phase].SetEnabled(False);old=phase;phase+=1
    if phase<len(SITES):hooks[phase].SetEnabled(True)
    transitions.append({'from':old,'to':phase,'active':sum(h.IsEnabled() for h in hooks)})
    save()

def observed(frame,location,_):
    global owner,manager
    try:
        pc=frame.GetPCAddress().GetFileAddress()
        if phase>=len(SITES) or pc!=SITES[phase] or pc!=location.GetAddress().GetFileAddress() or frame.GetThread().GetIndexID()!=1:
            raise ValueError('Exact owned main-thread phase required')
        reg=lambda n:frame.FindRegister(n).GetValueAsUnsigned()
        phase_hits[phase]+=1
        owner=reg('x19')-0x168
        g=scalar(frame,owner+0x2fc0,'Q')
        if scalar(frame,g+0x14)!=69:return False
        state=modal(frame,owner)
        if state['counter']!=0:raise ValueError('First-block dispatch required')
        records.append({'stage':'dispatch','voice':hex(owner),'note':69,'state':state})
        rotate();return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in hooks:hook.SetEnabled(False)
        save();return True

def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    if (base.ROOT/'runtime.json').exists():raise ValueError('Fresh private capture required')
    for i,address in enumerate(SITES):
        result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address '+hex(address)+' --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetAutoContinue(True);error=hook.SetScriptCallbackFunction(__name__+'.observed')
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetEnabled(i==0);hooks.append(hook);base.hooks.append(hook)
    base.save=save;save()
