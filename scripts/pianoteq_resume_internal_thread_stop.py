"""Normal Continue for an audited LLDB-owned pthread companion stop."""
import json


def resume(debugger, capture):
    import lldb
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    assert process.GetState() == lldb.eStateStopped and not capture.errors
    assert not capture.window_complete and target.GetNumBreakpoints() == len(capture.hooks) == 6
    assert all(h.IsEnabled() and h.IsHardware() for h in capture.hooks.values())
    internal = target.FindBreakpointByID(-2)
    assert internal.IsValid() and internal.IsInternal()
    addresses = [internal.GetLocationAtIndex(i).GetAddress() for i in range(internal.GetNumLocations())]
    owned = {h.GetID() for h in capture.hooks.values()}
    details = []
    companions = observations = 0
    for thread in process:
        reason = thread.GetStopReason()
        if reason in (lldb.eStopReasonNone, lldb.eStopReasonInvalid):
            continue
        frame = thread.GetFrameAtIndex(0)
        pc = frame.GetPCAddress()
        ids = [thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())]
        last = capture.last_seen.get(thread.GetThreadID())
        if reason == lldb.eStopReasonBreakpoint and len(ids) == 2 and ids[0] in owned:
            assert last and last['id'] == ids[0] and last['fileAddress'] == pc.GetFileAddress()
            assert last['stopId'] == process.GetStopID()
            observations += 1
        else:
            assert reason == lldb.eStopReasonException and ids == [6, 1, 0]
            assert pc.GetModule().GetFileSpec().GetFilename() == 'libsystem_pthread.dylib'
            assert any(a.GetModule().GetFileSpec().GetFilename() == 'libsystem_pthread.dylib'
                       and a.GetFileAddress()+4 == pc.GetFileAddress()
                       and a.GetLoadAddress(target)+4 == frame.GetPC() for a in addresses)
            error = lldb.SBError()
            code = process.ReadMemory(frame.GetPC(), 4, error)
            assert error.Success() and len(code) == 4
            assert int.from_bytes(code, 'little') & 0xffe0001f != 0xd4200000
            companions += 1
        details.append(dict(thread=thread.GetThreadID(), pc=hex(pc.GetFileAddress()),
                            loadPc=hex(frame.GetPC()), reason=reason, ids=ids, lastOwned=last))
    assert companions and observations
    previous = capture.acknowledged_transitions
    for transition in capture.slot_transitions[previous:]:
        transition['barrierStopId'] = process.GetStopID()
    capture.acknowledged_transitions = len(capture.slot_transitions)
    with (capture.ROOT/'owned-resumes.jsonl').open('a') as output:
        output.write(json.dumps(dict(protocol='lldb-internal-pthread-companion',
                     records=len(capture.records), stopId=process.GetStopID(),
                     transitionFrom=previous, transitionThrough=capture.acknowledged_transitions,
                     threads=details))+'\n')
    capture.save(force=True)
    debugger.SetAsync(False)
    error = process.Continue()
    assert error.Success(), str(error)
