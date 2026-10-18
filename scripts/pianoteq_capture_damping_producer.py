"""Four read-only diagnostic sites for damping configuration and position preparation."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar
from pianoteq_capture_source_weights import curve
records=[]
position_curves=[]
prepared_base_curves=[]
errors=[]
original_save=base.save


def save():
    original_save()
    p=base.ROOT/'runtime.json';d=json.loads(p.read_text());d.update(dampingProducerRecords=records,dampingProducerErrors=errors,dampingPositionCurves=position_curves,dampingPreparedBaseCurves=prepared_base_curves)
    p.write_text(json.dumps(d,indent=2,allow_nan=False))


base.save=save


def observed(frame,bp,_):
    try:
        if len(records)>=32:raise RuntimeError('Excess damping configurations')
        reg=lambda name:frame.FindRegister(name).GetValueAsUnsigned()
        v,g=reg('x19'),reg('x23');h=v-0x168;shared=scalar(frame,g+0x1240,'Q')
        records.append({'note':scalar(frame,g+0x14),'positionRoute':scalar(frame,shared+0x524,'B'),
            'hostPosition':scalar(frame,h+0x2ecc),'alternateHostPosition':scalar(frame,h+0x2ed0),
            'source':{key:scalar(frame,g+offset) for key,offset in [('position',0xfbc),('rolloff',0xfc0),('gainScale',0xfb8),('cubicGainScale',0xff8),('cubicScale',0xffc)]},
            'actual':{key:scalar(frame,v+offset) for key,offset in [('position',0x8d4),('rolloff',0x908),('gainScale',0x90c),('cubicGainScale',0x920),('cubicScale',0x91c)]}})
        save();return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:hook.SetEnabled(False)
        save();return True


def position_curve(frame,bp,_):
    try:
        c=frame.FindRegister('x0').GetValueAsUnsigned()
        import lldb
        error=lldb.SBError();note=frame.FindRegister('s0').GetData().GetFloat(error,0)
        if error.Fail():raise RuntimeError(str(error))
        if note!=69:return False
        if len(position_curves)>=16:raise RuntimeError('Excess note69 curve records')
        record={'note':note,'point':hex(frame.GetPC()),'curve':curve(frame,c)}
        if frame.GetPC()==0x100321f08:
            record['multiplier']=frame.FindRegister('s9').GetData().GetFloat(error,0)
            if error.Fail():raise RuntimeError(str(error))
        position_curves.append(record)
        save();return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:hook.SetEnabled(False)
        save();return True


def prepared_base_curve(frame,bp,_):
    try:
        if len(prepared_base_curves)>=8:return False
        c=frame.FindRegister('x0').GetValueAsUnsigned()
        prepared_base_curves.append({'curve':curve(frame,c)})
        save();return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:hook.SetEnabled(False)
        save();return True


def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    assert not (base.ROOT/'runtime.json').exists(),'Fresh capture required'
    for address,callback in [(0x10043e048,'observed'),(0x100321ec8,'position_curve'),(0x100321f08,'position_curve'),(0x1001f99d4,'prepared_base_curve')]:
        result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);error=hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetAutoContinue(True);base.hooks.append(hook)
    save()
