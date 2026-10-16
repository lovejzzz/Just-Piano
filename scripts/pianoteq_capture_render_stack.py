"""One read-only native render stack at a fixed hardware point."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({'point': '0x1007c0d50',
        'records': records, 'errors': errors, 'hits': hook.GetHitCount() if hook else 0}, indent=2))


def observed(frame, location, _):
    try:
        thread = frame.GetThread()
        stack = []
        for i in range(min(thread.GetNumFrames(), 16)):
            f = thread.GetFrameAtIndex(i)
            stack.append({'index': i, 'point': hex(f.GetPCAddress().GetFileAddress()),
                          'symbol': f.GetFunctionName(),
                          'symbolStart': hex(f.GetSymbol().GetStartAddress().GetFileAddress()),
                          'sp': hex(f.GetSP()), 'fp': hex(f.GetFP())})
        records.append({'thread': thread.GetThreadID(), 'stack': stack})
        hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    global hook
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    assert target.GetTriple().startswith('arm64-')
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x1007c0d50 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
