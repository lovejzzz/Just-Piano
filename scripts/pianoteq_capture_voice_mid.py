"""Same-run cross -> gain -> Rattle entry/return, four fixed hardware points."""
import json
import sys
import traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import pianoteq_capture_rattle_burst as burst
from pianoteq_damper_runtime_capture import scalar,unpack
from pianoteq_capture_recurrence import register

burst.POINTS.update(cross=0x100460acc,gain=0x100460c84)
contexts={}
original_observed=burst.observed


def save():
    burst.ROOT.mkdir(parents=True,exist_ok=True)
    data=dict(schema=1,fixedSites=True,siteCount=4,midChain=True,complete=burst.complete,
              records=burst.records,errors=burst.errors,voices=len(burst.voices),
              pending=len(burst.pending),midPending=len(contexts),
              observedPrimaryInputs=False,observedCrossInputs=True,observedSourceTables=True,
              activeSites=sum(h.IsEnabled() for h in burst.hooks.values()))
    (burst.ROOT/'runtime.json').write_text(json.dumps(data,allow_nan=False))
burst.save=save


def groups(frame,address):
    assert scalar(frame,address,'Q')==3
    return [burst.samples(frame,address+8+56*i) for i in range(3)]


def controls(frame,h):
    enabled=scalar(frame,h+0x2c94,'B')
    result=dict(level=scalar(frame,h+0x9c),gain=scalar(frame,h+0xa0),
                mergeEnabled=enabled,mergeCurrent=scalar(frame,h+0x2cd0) if enabled==1 else None,
                mergeRemaining=scalar(frame,h+0x2cdc,'I') if enabled==1 else None,
                primaryProcessorEnabled=scalar(frame,h+0x29b0,'B'),
                envelopeEnabled=scalar(frame,h+0x2908),filterEnabled=scalar(frame,h+0x290c),
                integratorWord=scalar(frame,h+0x2914,'I'))
    if result['envelopeEnabled']!=0:
        result.update(ratio=scalar(frame,h+0x2910),integratorScale=scalar(frame,h+0x2918))
    channels=scalar(frame,h+0xc44,'I');assert channels<=16
    result['eqChannels']=channels;result['eqSections']=0
    if channels:
        model=scalar(frame,h+0xc48,'Q');begin,end=unpack(frame,model+0x48,'QQ')
        assert end>=begin and (end-begin)%60==0 and (end-begin)//60<=16
        n=(end-begin)//60;result['eqSections']=n
        if n:
            coeff_begin,coeff_end=unpack(frame,model+0x30,'QQ');assert coeff_end-coeff_begin==n*16
            result['eqState']=dict(controls=list(unpack(frame,begin,'I'*(n*15))),
                coefficients=list(unpack(frame,coeff_begin,'I'*(n*4))),
                table=list(unpack(frame,scalar(frame,model+0x88,'Q'),'I'*(n*32))),
                history=list(unpack(frame,scalar(frame,model+0x60,'Q'),'I'*(n*4))),
                gainWords=list(unpack(frame,model,'IIIIII')),
                updating=scalar(frame,model+0x14,'B'),fast=scalar(frame,h+0xc64,'B'))
    return result


def observed(frame,location,internal):
    try:
        name=next(k for k,v in burst.POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
        thread=frame.GetThread().GetThreadID()
        site=dict(id=burst.hooks[name].GetID(),fileAddress=burst.POINTS[name],stopId=frame.GetThread().GetProcess().GetStopID())
        burst.last_seen[thread]=site
        if name in ('cross','gain'):
            h=register(frame,'x19');age=scalar(frame,h+0x6c,'I');matrix=register(frame,'x23')
            if name=='cross':
                assert thread not in contexts
                if h not in burst.voices:
                    assert age==0;burst.voices[h]=len(burst.voices)
                burst.main_thread=thread if burst.main_thread is None else burst.main_thread
                assert thread==burst.main_thread
                contexts[thread]=dict(voice=h,counter=age,matrix=matrix,stage='cross')
            else:
                c=contexts[thread];assert c['voice']==h and c['counter']==age and c['matrix']==matrix and c['stage']=='cross';c['stage']='gain'
            burst.records.append(dict(stage=name,site=site,thread=thread,epoch=burst.voices[h],voice=hex(h),counter=age,channels=groups(frame,matrix),midControls=controls(frame,h)))
            if len(burst.records)%128==0:save()
            return True
        c=contexts[thread]
        assert c['stage']==('gain' if name=='before' else 'before')
        start=len(burst.records);result=original_observed(frame,location,internal)
        if burst.errors:return result
        assert len(burst.records)==start+1
        row=burst.records[-1];assert row['voice']==hex(c['voice']) and row['counter']==c['counter']
        row['midControls']=controls(frame,c['voice']);row['channels']=groups(frame,c['matrix'])
        if name=='before':c['stage']='before'
        else:contexts.pop(thread)
        return True
    except Exception:
        burst.errors.append(traceback.format_exc())
        for hook in burst.hooks.values():hook.SetEnabled(False)
        save();return True
burst.observed=observed


def finish(debugger):
    assert not contexts
    for epoch in range(5):
        expected=[r['counter'] for r in burst.records if r['stage']=='before' and r['epoch']==epoch]
        for stage in ('cross','gain'):assert [r['counter'] for r in burst.records if r['stage']==stage and r['epoch']==epoch]==expected
    burst.finish(debugger)


def __lldb_init_module(debugger,internal):
    burst.__lldb_init_module(debugger,internal)
    # LLDB imports this wrapper into its interpreter namespace. Bind to that
    # visible name rather than the dependency imported only inside this module.
    for hook in burst.hooks.values():
        hook.SetScriptCallbackFunction(__name__+'.observed')
