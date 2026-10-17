"""A strictly identified syscall-return companion stop; ordinary Continue only.

No target code, memory, registers, PC, signals or breakpoint settings are changed.
Unknown stops fail closed and remain available for inspection.
"""
import json


def resume(debugger, capture):
    import lldb
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    assert process.GetState() == lldb.eStateStopped
    assert not capture.errors and not capture.window_complete
    assert target.GetNumBreakpoints() == len(capture.hooks) == 6
    assert all(h.IsEnabled() and h.IsHardware() for h in capture.hooks.values())
    owned = {h.GetID() for h in capture.hooks.values()}
    companion = []
    observed = []
    for thread in process:
        reason = thread.GetStopReason()
        if reason in (lldb.eStopReasonNone, lldb.eStopReasonInvalid):
            continue
        frame = thread.GetFrameAtIndex(0)
        pc = frame.GetPCAddress()
        ids = [thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())]
        last = capture.last_seen.get(thread.GetThreadID())
        row = dict(thread=thread.GetThreadID(), pc=hex(pc.GetFileAddress()),
                   loadPc=hex(frame.GetPC()), reason=reason, ids=ids, lastOwned=last)
        if reason == lldb.eStopReasonBreakpoint:
            assert len(ids) == 2 and ids[0] in owned and last
            assert last['id'] == ids[0] and last['fileAddress'] == pc.GetFileAddress()
            assert last['stopId'] == process.GetStopID()
            observed.append(row)
            continue
        assert reason == lldb.eStopReasonException and ids == [6, 1, 0]
        assert thread.GetThreadID() == capture.main_thread
        assert pc.GetModule().GetFileSpec().GetFilename() == 'libsystem_kernel.dylib'
        symbol = frame.GetSymbol()
        assert symbol.IsValid() and symbol.GetName() == '__psynch_cvsignal'
        assert frame.GetPC() == symbol.GetStartAddress().GetLoadAddress(target) + 8
        error = lldb.SBError()
        code = process.ReadMemory(frame.GetPC()-8, 12, error)
        # mov x16,#304 ; svc #0x80 ; b.lo +32 (system return, no BRK).
        assert error.Success() and code == bytes.fromhex('102680d2011000d403010054')
        assert thread.GetNumFrames() >= 4
        assert thread.GetFrameAtIndex(1).GetPCAddress().GetModule().GetFileSpec().GetFilename() == 'libsystem_pthread.dylib'
        assert thread.GetFrameAtIndex(3).GetPCAddress().GetFileAddress() == 0x10085ee30
        companion.append(row)
    assert len(companion) == 1 and observed
    previous = capture.acknowledged_transitions
    for transition in capture.slot_transitions[previous:]:
        transition['barrierStopId'] = process.GetStopID()
    capture.acknowledged_transitions = len(capture.slot_transitions)
    event = dict(protocol='cvsignal-companion-stop', records=len(capture.records),
                 stopId=process.GetStopID(), transitionFrom=previous,
                 transitionThrough=capture.acknowledged_transitions,
                 threads=companion+observed)
    with (capture.ROOT/'owned-resumes.jsonl').open('a') as output:
        output.write(json.dumps(event)+'\n')
    capture.save(force=True)
    debugger.SetAsync(False)
    error = process.Continue()
    assert error.Success(), str(error)
