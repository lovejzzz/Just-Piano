"""Six-site full response chain with upstream model/preset and lid-curve inputs.

Normalization inputs follow the dispatcher's configuration loads; its transient
shaped buffer is not captured. Actual normalized/final outputs remain targets.
"""
import json
import struct
import traceback
import pianoteq_capture_soundboard_receiver_chain as receivers
base=receivers.base
selected=receivers.observed.initialized.selected
final=selected.final
shaping=final.shaping
producer_inputs={}
model_inputs=None
model_target=None
normalization_arguments=None
original_save=base.save


def save():
    original_save()
    p=base.ROOT/'runtime.json';data=json.loads(p.read_text())
    data.update({'modelConfigurationInputs':model_inputs,'modelConfigurationTarget':model_target,
        'normalizationConfigurationArguments':normalization_arguments,
        'normalizationArgumentSiteObserved':False,'nativeShapedIntermediateCaptured':False})
    p.write_text(json.dumps(data,indent=2,allow_nan=False))


base.save=save


def reg(frame,name):return frame.FindRegister(name).GetValueAsUnsigned()


def producer(frame,breakpoint,_):
    try:
        stack=reg(frame,'sp')
        if struct.unpack('<Q',base.memory(frame,stack+0x128,8))[0]!=0x1003a8a98:return False
        model=reg(frame,'x23');config=reg(frame,'x19');component=reg(frame,'w20')
        if component in producer_inputs or component>2:raise RuntimeError('Producer component repeated/unsupported')
        if base.memory(frame,config+0x20,1)!=b'\0':raise RuntimeError('Special source mode unsupported')
        prefix=f'model-component-{component}';curve=base.memory(frame,model+0x2d8,0x50)
        producer_inputs[component]={'component':component,'sourcePositionPolicy':'literal-model',
            'model':base.dump(prefix+'.bin',base.memory(frame,model,0x340)),
            'preset':base.dump(prefix+'-preset.bin',base.memory(frame,reg(frame,'x0'),0x1840)),
            'bridge':receivers.observed.vector(frame,model+0x110,prefix+'-bridge.bin'),
            'propagationModes':receivers.observed.vector(frame,model+0x160,prefix+'-modes.bin'),
            'lidCurve':{'x':receivers.observed.vector(frame,model+0x2f0,prefix+'-lid-x.bin'),
                'y':receivers.observed.vector(frame,model+0x308,prefix+'-lid-y.bin'),
                'dimensions':struct.unpack_from('<I',curve,0x48)[0],'logX':curve[0x4c],'mode':curve[0x4d]}}
        return False
    except Exception:
        base.errors.append(traceback.format_exc());save();return True


def source(frame,breakpoint,context):
    global model_inputs,model_target,normalization_arguments
    try:
        if selected.seen==selected.selected:
            if model_inputs is not None:raise RuntimeError('Model source repeated')
            wrapper=reg(frame,'x19');component=struct.unpack('<I',base.memory(frame,wrapper+0x18,4))[0]
            if component not in producer_inputs:raise RuntimeError('Upstream model/preset source missing')
            model_inputs=dict(producer_inputs[component]);model_inputs['state']=reg(frame,'x0')
            model_target=base.dump('model-configuration-target.bin',base.memory(frame,wrapper+0x18,0x220))
            normalization_arguments=[struct.unpack('<f',base.memory(frame,wrapper+offset,4))[0] for offset in (0x160,0x3c,0x234)]
            shaping.tail['normalization']=normalization_arguments
        return receivers.source(frame,breakpoint,context)
    except Exception:
        base.errors.append(traceback.format_exc());save();return True


def raw(frame,breakpoint,context):return receivers.raw(frame,breakpoint,context)
def shape(frame,breakpoint,context):return receivers.shape(frame,breakpoint,context)


def resampling(frame,breakpoint,_):
    try:
        if reg(frame,'x30')!=0x100057298:return False
        if shaping.tail['shaping'] is None:return False
        if final.pending is not None:raise RuntimeError('Overlapping resampling')
        state=reg(frame,'x0')
        if state!=base.captured_source['state']:raise RuntimeError('Model-chain resampling state differs')
        shaping.tail['resampling']=shaping.floats(frame,2)
        shaping.tail['normalizedHeaders']=shaping.channel_headers(frame,state)
        for i,c in enumerate(shaping.tail['normalizedHeaders']):
            shaping.tail['normalized'].append(base.dump(f'normalized-{i}.bin',base.memory(frame,c['pointer'],c['length']*4)))
        final.pending={'state':state,'thread':frame.GetThread().GetThreadID()}
        save();return False
    except Exception:
        base.errors.append(traceback.format_exc());save();return True


def returned(frame,breakpoint,context):return receivers.returned(frame,breakpoint,context)


def __lldb_init_module(debugger,_):
    import lldb
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
    assert not (base.ROOT/'runtime.json').exists(),'Fresh capture directory required'
    for address,callback in [(0x1001ba8c0,'producer'),(0x1005a8874,'source'),(0x1005a91c8,'raw'),
                             (0x10069c084,'shape'),(0x1008d78e0,'resampling'),(0x100057390,'returned')]:
        result=lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        if not result.Succeeded():raise RuntimeError(result.GetError())
        hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error=hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail():raise RuntimeError(str(error))
        hook.SetAutoContinue(True);base.hooks.append(hook)
    save()
