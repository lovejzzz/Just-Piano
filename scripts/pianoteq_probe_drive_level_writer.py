"""Stop once on the actual drive-level write; never resume a watchpoint stop."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

watch = None
driver = None
evidence = None
errors = []


def save():
    (base.ROOT / 'runtime.json').write_text(json.dumps({'schema': 1, 'runStatus': base.run_status,
        'targetMutation': False, 'diagnosticOnly': True, 'nativeRenderComplete': False,
        'watchpointId': watch.GetID() if watch else None, 'driver': hex(driver) if driver else None,
        'writeEvidence': evidence, 'errors': errors}, indent=2, allow_nan=False))


def observed(frame, location, _):
    global watch, driver
    try:
        if frame.GetThread().GetIndexID() != 1 or frame.GetPCAddress().GetFileAddress() != 0x100829d48 or location.GetAddress().GetFileAddress() != 0x100829d48:
            raise ValueError('Exact owned global drive entry required')
        owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1006c2be0]
        if len(owners) != 1: raise ValueError('Actual global drive caller required')
        root = owners[0].FindRegister('x20').GetValueAsUnsigned()
        driver = frame.FindRegister('x0').GetValueAsUnsigned()
        if driver != scalar(frame, root + 0x88, 'Q') or watch is not None: raise ValueError('Unique actual drive object required')
        import lldb
        error = lldb.SBError()
        watch = frame.GetThread().GetProcess().GetTarget().WatchAddress(driver + 0x84, 4, False, True, error)
        if error.Fail() or not watch.IsValid(): raise RuntimeError(str(error))
        for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def run_probe(debugger, argv):
    global evidence
    import lldb
    try:
        base.launch_and_run(debugger, argv)
        raise RuntimeError('Expected a drive-level write before native completion')
    except Exception as stopped:
        process = debugger.GetSelectedTarget().GetProcess()
        owned = [thread for thread in process if thread.GetStopReason() == lldb.eStopReasonWatchpoint and
                 watch is not None and thread.GetStopReasonDataCount() and thread.GetStopReasonDataAtIndex(0) == watch.GetID()]
        if errors or len(owned) != 1 or process.GetState() != lldb.eStateStopped:
            errors.append(traceback.format_exc()); save(); raise
        thread = owned[0]; frame = thread.GetFrameAtIndex(0)
        evidence = {'pid': process.GetProcessID(), 'threadIndex': thread.GetIndexID(),
            'pc': hex(frame.GetPCAddress().GetFileAddress()), 'stopReason': thread.GetStopReason(),
            'description': thread.GetStopDescription(512), 'ownedDriverStop': str(stopped),
            'valueAfterWrite': scalar(frame, driver + 0x84), 'controlWords': list(unpack(frame, driver + 0x80, 'IIIIII')),
            'registers': {name: hex(frame.FindRegister(name).GetValueAsUnsigned()) for name in ['x0','x1','x8','x9','x19','x20','x21','x22']},
            'frames': [hex(f.GetPCAddress().GetFileAddress()) for f in list(thread)[:16]], 'watchpointStopResumed': False}
        save()
        error = process.Kill()
        if error.Fail(): raise RuntimeError(str(error))
        evidence['debugChildTerminated'] = True; save()
        return evidence


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh diagnostic directory required')
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address 0x100829d48 --shlib "Pianoteq 9"', result)
    if not result.Succeeded(): raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail(): raise RuntimeError(str(error))
    hook.SetAutoContinue(True); base.hooks.append(hook); base.save = save; save()
