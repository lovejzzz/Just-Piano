"""One passive routing site: complete keyed voice endpoints/order and native WAV.

Global runtime controls are intentionally not observed by this collector.
"""
import hashlib,json,traceback
import pianoteq_capture_key_audio_baseline as key
from pianoteq_damper_runtime_capture import scalar,unpack,memory
base=key.base

def save():
    key.save()
    p=base.ROOT/'runtime.json';d=json.loads(p.read_text())
    d.update(compactVoiceOrder=True,targetMutation=False,hardwareBreakpoints=1,
      globalControlsObserved=False,globalStatesObserved=False,keyMonoSourcesObserved=True,
      activeHardwareBreakpoints=sum(h.IsEnabled() for h in base.hooks))
    p.write_text(json.dumps(d,separators=(',',':'),allow_nan=False))

def observed(frame,location,internal):
    result=key.observed(frame,location,internal)
    if result:return result
    try:
        row=key.rows[-1];reg=lambda n:frame.FindRegister(n).GetValueAsUnsigned()
        voice,slot,workspace=reg('x3'),reg('x1'),reg('x2')
        height,capacity,width,pitch=unpack(frame,workspace+0xe8,'IIII')
        if height!=1 or not 1<=capacity<=8 or width!=64 or pitch<64:raise ValueError('Actual mono contribution required')
        mono=unpack(frame,scalar(frame,workspace+0xf8,'Q'),'f'*64)
        begin,end=unpack(frame,slot+0xe8,'QQ')
        if end-begin!=96:raise ValueError('Three actual voice routing mappings required')
        row.update(keyIndex=scalar(frame,voice+0x64,'I'),mixLevels=list(unpack(frame,voice+0xf0,'ffff')),
          monoContribution=list(mono),mappings=[key.mapping(frame,slot+0xc8)]+[key.mapping(frame,begin+32*i) for i in range(3)])
        return False
    except Exception:
        key.errors.append(traceback.format_exc())
        for hook in base.hooks:hook.SetEnabled(False)
        save();return True

def __lldb_init_module(debugger,_):
    key.__lldb_init_module(debugger,{})
    if len(base.hooks)!=1 or key.WITH_GLOBAL:raise ValueError('Exactly one routing observation site required')
    err=base.hooks[0].SetScriptCallbackFunction(__name__+'.observed')
    if err and err.Fail():raise RuntimeError(str(err))
    base.save=save;save()
