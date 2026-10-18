"""One read-only hardware point observes completed pitch/velocity production."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar
from pianoteq_capture_source_weights import curve
records=[]
errors=[]
original_save=base.save


def save():
    original_save()
    path=base.ROOT/'runtime.json';d=json.loads(path.read_text())
    d.update(velocityProducerRecords=records,velocityProducerErrors=errors)
    path.write_text(json.dumps(d,indent=2,allow_nan=False))


base.save=save


def observed(frame,bp,_):
    try:
        if len(records)>=32:raise RuntimeError('Excess velocity producer records')
        reg=lambda name:frame.FindRegister(name).GetValueAsUnsigned()
        v,g=reg('x19'),reg('x23');h=v-0x168
        if scalar(frame,reg('x20'),'Q')!=g:raise RuntimeError('Pitch source G identity differs')
        shared=scalar(frame,g+0x1240,'Q')
        records.append({'note':scalar(frame,g+0x14),'velocity':scalar(frame,h+0x78),
            'hostMode':scalar(frame,h+0x2f90,'I'),'host2fe0':scalar(frame,h+0x2fe0),
            'gA0':scalar(frame,g+0xa0),'gC0':scalar(frame,g+0xc0),
            'shared8c':scalar(frame,shared+0x8c),'shared90':scalar(frame,shared+0x90),
            'sharedMode':scalar(frame,shared+0x140,'I'),'velocityCurve':curve(frame,shared+0x218),
            'velocityScale':scalar(frame,h+0x80),'pitchStrength':scalar(frame,v+0x938),
            'pitchRelaxation':scalar(frame,v+0x93c),'pitchVelocityScale':scalar(frame,v+0x940)})
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    assert not (base.ROOT/'runtime.json').exists(),'Fresh capture required'
    result=lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --address 0x10043dff4 --shlib "Pianoteq 9"',result)
    if not result.Succeeded():raise RuntimeError(result.GetError())
    hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
    error=hook.SetScriptCallbackFunction(__name__+'.observed')
    if error and error.Fail():raise RuntimeError(str(error))
    hook.SetAutoContinue(True);base.hooks.append(hook);save()
