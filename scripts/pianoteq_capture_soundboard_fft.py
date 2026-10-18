"""Read-only ordered FFT input/output oracle at the two shaping call sites."""
import hashlib
import json
import os
from pathlib import Path
import struct
import traceback
import pianoteq_capture_soundboard_responses as base

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
FFT_LENGTH = int(os.environ.get('PIANOTEQ_FFT_LENGTH', '16384'))
if FFT_LENGTH not in (16384, 32768): raise ValueError('Supported inspected FFT length required')
records = []
pending = None
errors = []
original_save = base.save


def save():
    original_save()
    p = ROOT / 'runtime.json'
    d = json.loads(p.read_text())
    d.update({'fftRecords': records, 'fftErrors': errors, 'fftPending': pending,
              'breakpointHits': [h.GetHitCount() for h in base.hooks]})
    p.write_text(json.dumps(d, indent=2))


base.save = save


def entry(frame, breakpoint, _):
    global pending
    try:
        lr = frame.FindRegister('x30').GetValueAsUnsigned()
        if lr not in (0x10069c288, 0x10069c834): return False
        if pending is not None: raise RuntimeError('Overlapping shaping FFT calls')
        setup = frame.FindRegister('x0').GetValueAsUnsigned()
        header = base.memory(frame, setup, 0x88)
        length, lanes = struct.unpack_from('<2I', header)
        if length != FFT_LENGTH or lanes != length // 8:
            raise RuntimeError(f'Unexpected FFT setup {length}/{lanes}')
        input_pointer = frame.FindRegister('x1').GetValueAsUnsigned()
        output_pointer = frame.FindRegister('x2').GetValueAsUnsigned()
        number = len(records)
        e, twiddle = struct.unpack_from('<2Q', header, 0x78)
        record = {'number': number, 'thread': frame.GetThread().GetThreadID(),
            'length': length, 'returnAddress': lr,
            'direction': frame.FindRegister('w4').GetValueAsUnsigned(),
            'input': base.dump(f'fft-{number}-input.bin', base.memory(frame, input_pointer, length * 4)),
            'setup': base.dump(f'fft-{number}-setup.bin', header),
            'e': base.dump(f'fft-{number}-e.bin', base.memory(frame, e, length * 3)),
            'twiddle': base.dump(f'fft-{number}-twiddle.bin', base.memory(frame, twiddle, length)),
        }
        records.append(record)
        pending = {'index': number, 'output': output_pointer, 'thread': record['thread'], 'return': lr}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending
    try:
        if pending is None: return False
        if frame.GetPC() != pending['return'] or frame.GetThread().GetThreadID() != pending['thread']:
            raise RuntimeError('FFT return ownership differs')
        record = records[pending['index']]
        record['output'] = base.dump(f"fft-{record['number']}-output.bin",
                                     base.memory(frame, pending['output'], record['length'] * 4))
        pending = None
        if len(records) >= 6:
            for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x1003949ec, 'entry'), (0x10069c288, 'returned'), (0x10069c834, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
