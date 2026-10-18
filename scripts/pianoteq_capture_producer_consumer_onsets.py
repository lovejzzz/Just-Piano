"""Three fixed passive sites bind first voice first two produced/consumed blocks.

All threads are observed because cached modal production runs off the main
thread. Native state/audio remain private and are diagnostic targets only.
"""
import hashlib
import json
import traceback
import pianoteq_capture_first_modal_block as snapshot
base=snapshot.base
scalar=snapshot.scalar
unpack=snapshot.unpack
SITES=[0x10020b28c,0x10020b438,0x1004604cc]
CALLERS={0x100416778:'cache',0x1004604cc:'direct'}
hooks=[]
records=[]
errors=[]
pending={}
produced={}
consumed={}
hits=[0,0,0]
serial=0
retired=False


def save():
    d={'schema':1,'runStatus':base.run_status,'targetMutation':False,'sites':[hex(x) for x in SITES],
       'hardwareBreakpoints':len(hooks),'activeHardwareBreakpoints':sum(h.IsEnabled() for h in hooks),
       'allThreads':True,'records':records,'errors':errors,'hits':hits,'pending':pending,
       'completeFirstVoiceTwoBlockBinding':retired,'scope':'first voice two produced and consumed blocks; remaining voices and continuous state unobserved'}
    q=base.ROOT/'runtime.json.tmp';q.write_text(json.dumps(d,separators=(',',':'),allow_nan=False));q.replace(base.ROOT/'runtime.json')


def audio(frame,matrix,name):
    if scalar(frame,matrix,'Q')!=3:raise ValueError('Three complete main groups required')
    raw=[]
    for i in range(3):
        desc=matrix+8+56*i;rows,capacity,n,stride=unpack(frame,desc,'IIII')
        if rows!=1 or n!=64 or not 1<=capacity<=8 or stride<64:raise ValueError('Complete mono64 group required')
        raw.append(base.memory(frame,scalar(frame,desc+16,'Q'),256))
    data=b''.join(raw);(base.ROOT/name).write_bytes(data)
    return {'audioFile':name,'audioBytes':len(data),'audioSha256':hashlib.sha256(data).hexdigest()}


def controls(frame,h):
    return {hex(off):scalar(frame,h+off,'I') for off in [0x128,0x140,0x150,0x154,0x158,0x15c,0x160,0x2ec8,0x2ecc,0x2ed0,0x2ed4,0x2f38,0x2f78,0x2f7c,0x2f80,0x2f84,0x2f88,0x2f8c,0x2f90]}


def finish():
    global retired
    if len(produced)==1 and len(consumed)==1 and all(v==[0,64] for v in produced.values()) and all(v==[0,64] for v in consumed.values()) and not pending:
        for hook in hooks:hook.SetEnabled(False)
        retired=True
    save()


def observed(frame,location,_):
    global serial
    try:
        pc=frame.GetPCAddress().GetFileAddress()
        if pc not in SITES or pc!=location.GetAddress().GetFileAddress():raise ValueError('Owned fixed site required')
        site=SITES.index(pc);hits[site]+=1;serial+=1
        if sum(hits)>30000:raise ValueError('Bounded observation required')
        reg=lambda n:frame.FindRegister(n).GetValueAsUnsigned()
        thread=frame.GetThread().GetThreadID();threadIndex=frame.GetThread().GetIndexID()
        if site==0:
            if thread in pending:raise ValueError('Non-reentrant producer call required')
            h,matrix,caller=reg('x0'),reg('x1'),reg('lr')
            if caller not in CALLERS:raise ValueError('Known direct/cache producer caller required')
            g=scalar(frame,h+0x2fc0,'Q')
            if scalar(frame,g+0x14)!=69:raise ValueError('Bound fixture note69 required')
            counter=scalar(frame,h+0x178,'I')
            selected=counter in [0,64]
            row={'voice':hex(h),'matrix':hex(matrix),'caller':hex(caller),'path':CALLERS[caller],'counter':counter,'selected':selected,'entrySerial':serial,'entryThreadIndex':threadIndex}
            if selected:
                previous=produced.setdefault(hex(h),[])
                if counter!=64*len(previous) or len(produced)>1:raise ValueError('One first-voice contiguous producer pair required')
                row.update(entryMode=reg('w2'),before=snapshot.modal(frame,h),beforeControls=controls(frame,h))
            pending[thread]=row
        elif site==1:
            if thread not in pending:raise ValueError('Producer exit without owned entry')
            row=pending.pop(thread);h,matrix=reg('x20'),reg('x19')
            if row['voice']!=hex(h) or row['matrix']!=hex(matrix):raise ValueError('Same producer voice/matrix across call required')
            if row['selected']:
                state=snapshot.modal(frame,h)
                if state['counter']!=row['counter']+64 or state['initialFlag']!=0:raise ValueError('Completed corresponding primary block required')
                ordinal=len([r for r in records if r['stage']=='produced'])
                row.update(stage='produced',exitSerial=serial,exitThreadIndex=threadIndex,after=state,afterControls=controls(frame,h),**audio(frame,matrix,'produced-'+str(ordinal)+'.bin'))
                records.append(row);produced[hex(h)].append(row['counter'])
        else:
            if threadIndex!=1:raise ValueError('Consumer must be main thread')
            h,matrix=reg('x19'),reg('x23');age=scalar(frame,h+0x6c,'I')
            if age>=128:return False
            previous=consumed.setdefault(hex(h),[])
            if age!=64*len(previous) or len(consumed)>1:raise ValueError('One first-voice contiguous consumer pair required')
            ordinal=len([r for r in records if r['stage']=='consumed'])
            records.append({'stage':'consumed','voice':hex(h),'counter':age,'serial':serial,'threadIndex':threadIndex,'controls':controls(frame,h),**audio(frame,matrix,'consumed-'+str(ordinal)+'.bin')})
            previous.append(age)
        finish();return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in hooks:hook.SetEnabled(False)
        save();return True


def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    if (base.ROOT/'runtime.json').exists():raise ValueError('Fresh private capture required')
    for address in SITES:
        result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --address '+hex(address)+' --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetAutoContinue(True);error=hook.SetScriptCallbackFunction(__name__+'.observed')
        if error and error.Fail():raise RuntimeError(str(error))
        hooks.append(hook);base.hooks.append(hook)
    base.save=save;save()
