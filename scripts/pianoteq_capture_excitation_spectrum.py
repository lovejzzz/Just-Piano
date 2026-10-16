"""Read-only single-point capture of slope -> log spectrum -> exp spectrum.

Import in LLDB against the user-authorized independent debug copy; set
PIANOTEQ_CAPTURE_DIR. Exact executable __text hash is checked before hooking.
"""
import json
import os
from pathlib import Path
import struct
import traceback
import lldb
from pianoteq_damper_runtime_capture import verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
ROOT.mkdir(parents=True, exist_ok=True)
records, errors = [], []
hook = None


def save():
    (ROOT/'runtime.json').write_text(json.dumps({'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0, 'address': '0x1006950e8'}, indent=2))


def reg(f, n):
    return f.FindRegister(n).GetValueAsUnsigned()


def memory(f, a, n):
    assert a > 4096 and 0 < n <= 65536
    error = lldb.SBError()
    raw = f.GetThread().GetProcess().ReadMemory(a, n, error)
    if error.Fail() or len(raw) != n:
        raise RuntimeError(str(error))
    return raw


def pointer(f, a):
    return struct.unpack('<Q', memory(f,a,8))[0]


def floats(f, a, n):
    return list(struct.unpack('<'+'f'*n, memory(f,a,4*n)))


def scalar(f, n):
    data = f.FindRegister(n).GetData()
    error = lldb.SBError()
    value = data.GetFloat(error, 0)
    if error.Fail():
        raise RuntimeError(str(error))
    return value


def observed(f, bp, internal_dict):
    if len(records) >= 256:
        return False
    try:
        scratch, model = reg(f,'x19'), reg(f,'x25')
        count = pointer(f,scratch+0xf8) & 0xffffffff
        assert 0 < count <= 4096
        block = reg(f,'x24')
        assert block*4 < count+4
        logbase = pointer(f,scratch+0x278)
        bheader = pointer(f,scratch+0x1c0)
        kbase = pointer(f,model+0x7b8)
        kend = pointer(f,model+0x7c0)
        nk = (kend-kbase)//4
        assert 0 < nk <= 4096
        params = pointer(f,scratch+0x118)
        record = {'thread': f.GetThread().GetThreadID(), 'sp': reg(f,'sp'),
            'scratch': scratch, 'model': model, 'count': count, 'block': block,
            'log_before': floats(f,logbase+16*block,4),
            'exp_after': list(struct.unpack('<4f',struct.pack('<QQ',reg(f,'x0'),reg(f,'x1')))),
            'slope': floats(f,scratch+0x230,1)[0],
            'base_scale': floats(f,scratch+0x240,1)[0],
            'reference': scalar(f,'s15'), 'lower': scalar(f,'s10'),
            'coordinates': floats(f,kbase,nk),
            'base_table': floats(f,pointer(f,bheader),count),
            'extra_table': floats(f,pointer(f,scratch+0x2a0),count),
            'model_g_f0': floats(f,model+0xf0,1)[0],
            'model_g_1014': floats(f,model+0x1014,1)[0],
            'param_2c': floats(f,params+0x2c,1)[0],
            'param_34': floats(f,params+0x34,1)[0],
            'model_g_e7c': floats(f,model+0xe7c,1)[0],
        }
        records.append(record)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, internal_dict):
    global hook
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory())/spec.GetFilename())
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x1006950e8 --shlib "Pianoteq 9"',result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
    hook.SetScriptCallbackFunction(__name__+'.observed')
    save()
