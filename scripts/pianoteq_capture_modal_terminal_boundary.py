"""Passive single-site two terminal/modal observations for each of five note69 voices.

Read-only hardware hook after primary voice processing, before spatial processing.
No target writes, evaluation, stepping, injection or exception resumes.
"""
import hashlib
import json
import traceback
import pianoteq_capture_first_modal_block as snapshot
base=snapshot.base
scalar=snapshot.scalar
unpack=snapshot.unpack
SITE=0x100460f1c
hooks=[]
records=[]
errors=[]
voices={}
hits=0

def save():
    d={'schema':1,'runStatus':base.run_status,'targetMutation':False,'sites':[hex(SITE)],
       'hardwareBreakpoints':len(hooks),'activeHardwareBreakpoints':sum(h.IsEnabled() for h in hooks),
       'records':records,'errors':errors,'hits':hits,'completeFiveTwoBlockOnsets':len(records)==10,
       'scope':'first two terminal blocks per five voices; continuous state unobserved'}
    q=base.ROOT/'runtime.json.tmp';q.write_text(json.dumps(d,separators=(',',':'),allow_nan=False));q.replace(base.ROOT/'runtime.json')

def observed(frame,location,_):
    global hits
    try:
        if frame.GetPCAddress().GetFileAddress()!=SITE or location.GetAddress().GetFileAddress()!=SITE or frame.GetThread().GetIndexID()!=1:
            raise ValueError('Exact owned main-thread site required')
        hits+=1
        h=frame.FindRegister('x19').GetValueAsUnsigned();v=h+0x168
        g=scalar(frame,h+0x2fc0,'Q')
        if scalar(frame,g+0x14)!=69:raise ValueError('Fixture note69 required')
        age=scalar(frame,h+0x6c,'I')
        if h not in voices:
            if age!=0 or len(voices)>=5:raise ValueError('Five counter-zero voice births required')
            voices[h]=len(voices)
        if age>=128:return False
        epoch=voices[h]
        previous=[r['counter'] for r in records if r['epoch']==epoch]
        if age!=64*len(previous):raise ValueError('Consecutive first two terminal blocks per voice required')
        state=snapshot.modal(frame,h)
        # Record actual modal counters/flags; relation to outer voice age is a target of this probe.
        matrix=frame.FindRegister('x23').GetValueAsUnsigned()
        if scalar(frame,matrix,'Q')!=3:raise ValueError('All three primary groups required')
        audio=[]
        for i in range(3):
            desc=matrix+8+56*i;rows,capacity,n,stride=unpack(frame,desc,'IIII')
            if rows!=1 or n!=64 or not 1<=capacity<=8 or stride<64:raise ValueError('Complete primary group matrix required')
            audio.append(base.memory(frame,scalar(frame,desc+16,'Q'),256))
        data=b''.join(audio);name='terminal-first-'+str(epoch)+'-'+str(age)+'.bin';(base.ROOT/name).write_bytes(data)
        records.append({'epoch':epoch,'voice':hex(h),'stage':'terminal','counter':age,'note':69,
          'state':state,
          'cacheWords':{hex(off):scalar(frame,h+off,'I') for off in [0x2f78,0x2f7c,0x2f80,0x2f84,0x2f88,0x2f8c,0x2fb4]},
          'threadFrames':[{'index':thread.GetIndexID(),'frames':[{'pc':hex(thread.GetFrameAtIndex(i).GetPCAddress().GetFileAddress())} for i in range(min(thread.GetNumFrames(),6))]} for thread in frame.GetThread().GetProcess()],
          'audioFile':name,'audioBytes':len(data),'audioSha256':hashlib.sha256(data).hexdigest()})
        if len(records)==10:
            for hook in hooks:hook.SetEnabled(False)
        save();return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in hooks:hook.SetEnabled(False)
        save();return True

def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    if (base.ROOT/'runtime.json').exists():raise ValueError('Fresh private capture required')
    result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address '+hex(SITE)+' --shlib "Pianoteq 9"',result)
    if not result.Succeeded():raise RuntimeError(result.GetError())
    hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetAutoContinue(True);error=hook.SetScriptCallbackFunction(__name__+'.observed')
    if error and error.Fail():raise RuntimeError(str(error))
    hooks.append(hook);base.hooks.append(hook);base.save=save;save()
