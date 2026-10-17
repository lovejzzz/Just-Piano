"""Two fixed hardware points around 30bd30; read-only, complete-run capture.

The primary input and shared source table are observed component inputs. This
does not assert that the entire voice or its excitation source is independent.
"""
import json
import os
from pathlib import Path
import traceback
import time
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS = {'before': 0x10030bd30, 'after': 0x10030c104}
hooks, records, errors, voices, pending, tables = {}, [], [], {}, {}, set()
last_seen = {}
complete = False
main_thread = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    data = dict(schema=1, fixedSites=True, siteCount=len(POINTS), complete=complete,
                records=records, errors=errors, voices=len(voices), pending=len(pending),
                observedPrimaryInputs=True, observedSourceTables=True,
                activeSites=sum(h.IsEnabled() for h in hooks.values()))
    (ROOT/'runtime.json').write_text(json.dumps(data, allow_nan=False))


def state(frame, obj):
    begin, end = unpack(frame, obj+0x38, 'QQ')
    assert end >= begin and (end-begin) % 72 == 0
    count = (end-begin)//72
    head = scalar(frame, obj+0x54, 'I')
    active = scalar(frame, obj+0x58, 'I')
    assert count <= 128 and active <= count and (not active or head < count)
    used = {(head+i) % count for i in range(active)}
    slots = []
    for i in range(count):
        a = begin+72*i
        history = scalar(frame, a+0x18, 'Q')
        slots.append(dict(coefficients=list(unpack(frame, a, 'IIIII')),
                          history=list(unpack(frame, history, 'IIII')) if i in used else None,
                          cursor=scalar(frame, a+0x40, 'I'), gain=scalar(frame, a+0x44, 'I')))
    return dict(controls={key: scalar(frame, obj+off) for key, off in
                [('scale',0x18), ('levelStep',0x1c), ('sampleRate',0x20),
                 ('period',0x28), ('decay',0x50)]},
                elapsed=scalar(frame,obj+0x24), peak=scalar(frame,obj+0x2c),
                floor=scalar(frame,obj+0x30), level=scalar(frame,obj+0x34),
                head=head, active=active, slots=slots)


def samples(frame, descriptor):
    rows,stride,n,row_stride = unpack(frame, descriptor, 'IIII')
    assert rows == 1 and n == 64
    return list(unpack(frame, scalar(frame,descriptor+16,'Q'), 'f'*n))


def observed(frame, location, _):
    global main_thread
    try:
        name = next(k for k,v in POINTS.items() if v == frame.GetPCAddress().GetFileAddress())
        thread = frame.GetThread().GetThreadID()
        site = dict(id=hooks[name].GetID(), fileAddress=POINTS[name],
                    stopId=frame.GetThread().GetProcess().GetStopID())
        last_seen[thread] = site
        if name == 'before':
            target = frame.GetThread().GetProcess().GetTarget()
            caller = target.ResolveLoadAddress(register(frame,'x30')).GetFileAddress()
            assert caller == 0x100460de4
            main_thread = thread if main_thread is None else main_thread
            assert thread == main_thread and thread not in pending
            obj = register(frame,'x0'); h = obj-0x28a8
            source, destination = register(frame,'x1'), register(frame,'x2')
            assert source == destination
            age = scalar(frame,h+0x6c,'I')
            if h not in voices:
                assert age == 0
                voices[h] = len(voices)
            row = dict(stage=name, site=site, thread=thread, epoch=voices[h],
                       voice=hex(h), counter=age, control=regfloat(frame,'s0','f'),
                       cachedControl=scalar(frame,h+0x2f38), input=samples(frame,source),
                       state=state(frame,obj))
            bank = scalar(frame,obj+0x10,'Q')
            if row['control'] != 0 or row['state']['active']:
                pointer, count = unpack(frame,bank,'QQ')
                assert 0 < count <= 131072
                row['sourceTable'] = dict(pointer=hex(pointer), count=count)
                if (pointer,count) not in tables:
                    row['sourceTable']['values'] = list(unpack(frame,pointer,'f'*count))
                    tables.add((pointer,count))
            records.append(row)
            pending[thread] = dict(obj=obj, voice=h, descriptor=destination, counter=age)
        else:
            p = pending.pop(thread)
            assert register(frame,'x19') == p['obj'] and register(frame,'x20') == p['descriptor']
            records.append(dict(stage=name, site=site, thread=thread, epoch=voices[p['voice']],
                           voice=hex(p['voice']), counter=p['counter'],
                           output=samples(frame,p['descriptor']), state=state(frame,p['obj'])))
        if len(records) % 128 == 0:
            save()
        return True
    except Exception:
        errors.append(traceback.format_exc())
        for hook in hooks.values():
            hook.SetEnabled(False)
        save()
        return True


def finish(debugger):
    global complete
    import lldb
    p = debugger.GetSelectedTarget().GetProcess()
    assert p.GetState() == lldb.eStateExited and p.GetExitStatus() == 0
    assert not errors and not pending and len(voices) == 5 and tables
    for epoch in range(5):
        before = [r['counter'] for r in records if r['stage']=='before' and r['epoch']==epoch]
        after = [r['counter'] for r in records if r['stage']=='after' and r['epoch']==epoch]
        assert before and before == after == list(range(0,64*len(before),64))
    for hook in hooks.values():
        hook.SetEnabled(False)
    complete = True
    save()


def resume_owned_stops(debugger, owner=None):
    import lldb
    c=sys.modules[__name__] if owner is None else owner
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    debugger.SetAsync(False)
    deadline = time.monotonic()+40
    while process.GetState() == lldb.eStateStopped and time.monotonic() < deadline:
        assert not c.errors and not c.complete
        assert target.GetNumBreakpoints() == len(c.hooks) == len(c.POINTS) <= 6
        assert all(h.IsEnabled() and h.IsHardware() for h in c.hooks.values())
        matched = False
        details = []
        internal = target.FindBreakpointByID(-2)
        locations = [internal.GetLocationAtIndex(i).GetAddress() for i in range(internal.GetNumLocations())] if internal.IsValid() and internal.IsInternal() else []
        for thread in process:
            reason = thread.GetStopReason()
            if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):
                continue
            frame = thread.GetFrameAtIndex(0)
            pc = frame.GetPCAddress()
            ids = [thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())]
            seen = c.last_seen.get(thread.GetThreadID())
            own = seen and pc.GetFileAddress() in (seen['fileAddress'],seen['fileAddress']+4)
            if reason == lldb.eStopReasonBreakpoint and ids and ids[0] == (1<<64)-2:
                assert len(ids) == 2 and any(a.GetModule().GetFileSpec().GetFilename() == 'libsystem_pthread.dylib' and a.GetLoadAddress(target) == frame.GetPC() for a in locations)
            elif reason == lldb.eStopReasonException and ids == [6,1,0] and not own:
                assert pc.GetModule().GetFileSpec().GetFilename() == 'libsystem_pthread.dylib'
                assert any(a.GetModule().GetFileSpec().GetFilename() == 'libsystem_pthread.dylib' and a.GetLoadAddress(target)+4 == frame.GetPC() for a in locations)
            elif reason == lldb.eStopReasonBreakpoint:
                assert own and len(ids) == 2 and ids[0] == seen['id']
            elif reason == lldb.eStopReasonException:
                assert own and ids in ([6,1,0],[6,1,frame.GetPC()])
            elif reason == lldb.eStopReasonTrace:
                assert own and pc.GetFileAddress() == seen['fileAddress']+4 and ids == []
            else:
                raise AssertionError(('Unowned stop',reason,hex(pc.GetFileAddress()),ids))
            matched = True
            details.append(dict(thread=thread.GetThreadID(),pc=hex(pc.GetFileAddress()),reason=reason,ids=ids,lastOwned=seen))
        assert matched
        with (c.ROOT/'owned-resumes.jsonl').open('a') as output:
            output.write(json.dumps(dict(stopId=process.GetStopID(),records=len(c.records),threads=details))+'\n')
        error = process.Continue()
        assert error.Success(), str(error)
    c.save()


def __lldb_init_module(debugger, _):
    import lldb
    assert not (ROOT/'runtime.json').exists()
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory())/spec.GetFilename())
    for name,address in POINTS.items():
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
        assert result.Succeeded(), result.GetError()
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        hook.SetScriptCallbackFunction(__name__+'.observed'); hook.SetAutoContinue(False)
        hooks[name] = hook
    assert target.GetNumBreakpoints() == len(POINTS) <= 6 and all(h.IsHardware() for h in hooks.values())
    save()
