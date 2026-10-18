"""Read-only matrix construction and conjugate-gradient trace at five HW sites."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
records = []
pending = None
errors = []
original_save = base.save


def save():
    original_save()
    p = base.ROOT / 'runtime.json'; x = json.loads(p.read_text())
    x.update({'sparseRecords': records, 'sparsePending': pending, 'sparseErrors': errors})
    p.write_text(json.dumps(x, indent=2, allow_nan=False))


base.save = save


def vector(frame, address, label):
    start, end = struct.unpack('<2Q', base.memory(frame, address, 16))
    if end < start or (end-start) % 4 or end-start > 1000000: raise RuntimeError('Invalid float vector')
    return base.dump(label + '.bin', base.memory(frame, start, end-start))


def matrix(frame, address, label):
    start, end, capacity, columns = struct.unpack('<4Q', base.memory(frame, address, 32))
    if end < start or (end-start) % 32 or end-start > 1000000 or not 1 <= columns <= 100000: raise RuntimeError('Invalid matrix')
    rows = []
    for i, row in enumerate(range(start, end, 32)):
        begin, finish, cap, width = struct.unpack('<4Q', base.memory(frame, row, 32))
        if finish < begin or (finish-begin) % 16 or finish-begin > 1000000: raise RuntimeError('Invalid sparse row')
        entries = []
        for entry in range(begin, finish, 16):
            data = base.memory(frame, entry, 16); index = struct.unpack_from('<Q', data)[0]; value = struct.unpack_from('<f', data, 8)[0]
            entries.append({'index': index, 'value': value})
        rows.append({'row': i, 'entries': entries})
    return base.dump(label + '.json', json.dumps({'columns': columns, 'rows': rows}, allow_nan=False).encode())


def current(frame):
    if pending is None or pending['thread'] != frame.GetThread().GetThreadID(): raise RuntimeError('Sparse ownership differs')
    return records[pending['index']]


def entry(frame, breakpoint, _):
    global pending
    try:
        import lldb
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x100056fe4: return False
        if pending is not None: raise RuntimeError('Overlapping sparse builders')
        wrapper = frame.FindRegister('x19').GetValueAsUnsigned(); state = frame.FindRegister('x0').GetValueAsUnsigned()
        config = wrapper + 0x18; index = len(records)
        start, end = struct.unpack('<2Q', base.memory(frame, config + 0x68, 16))
        if end-start != 16: raise RuntimeError('Four bridge coordinates required')
        values = []
        for i in range(4):
            error = lldb.SBError(); values.append(frame.FindRegister(f's{i}').GetData().GetFloat(error, 0))
            if error.Fail(): raise RuntimeError(str(error))
        records.append({'number': index, 'config': base.dump(f'sparse-{index}-config.bin', base.memory(frame, config, 0x130)),
                        'bridge': base.dump(f'sparse-{index}-bridge.bin', base.memory(frame, start, 16)), 'parameters': values,
                        'iterationsSeen': 0, 'iterations': []})
        pending = {'index': index, 'thread': frame.GetThread().GetThreadID(), 'state': state, 'cg': None}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def cg_entry(frame, breakpoint, _):
    try:
        if frame.FindRegister('x30').GetValueAsUnsigned() != 0x1004103d8: return False
        r = current(frame); i = r['number']
        solution = frame.FindRegister('x1').GetValueAsUnsigned(); options = frame.FindRegister('x5').GetValueAsUnsigned()
        r['matrix'] = matrix(frame, frame.FindRegister('x0').GetValueAsUnsigned(), f'sparse-{i}-reduced')
        r['initial'] = vector(frame, solution, f'sparse-{i}-initial')
        r['rhs'] = vector(frame, frame.FindRegister('x2').GetValueAsUnsigned(), f'sparse-{i}-rhs')
        r['optionsBefore'] = base.dump(f'sparse-{i}-options-before.bin', base.memory(frame, options, 0x60))
        pending['cg'] = {'solution': solution, 'options': options}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def iteration(frame, breakpoint, _):
    try:
        if pending is None or not pending['cg']: return False
        r = current(frame); step = r['iterationsSeen']; r['iterationsSeen'] += 1
        if step < 5:
            stack = frame.FindRegister('sp').GetValueAsUnsigned(); prefix = f"sparse-{r['number']}-iteration-{step}"
            r['iterations'].append({'step': step, 'solution': vector(frame, pending['cg']['solution'], prefix+'-x'),
                'p': vector(frame, stack+0x40, prefix+'-p'), 'r': vector(frame, stack+0x58, prefix+'-r'),
                'q': vector(frame, stack+0x70, prefix+'-q')})
            save()
        return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def cg_return(frame, breakpoint, _):
    try:
        r = current(frame); cg = pending['cg']
        if cg is None: raise RuntimeError('CG entry missing')
        r['solution'] = vector(frame, cg['solution'], f"sparse-{r['number']}-solution")
        r['optionsAfter'] = base.dump(f"sparse-{r['number']}-options-after.bin", base.memory(frame, cg['options'], 0x60))
        pending['cg'] = None
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending
    try:
        r = current(frame); state = pending['state']; i = r['number']
        if pending['cg']: raise RuntimeError('CG still pending')
        r['shape'] = vector(frame, state+0x88, f'sparse-{i}-shape')
        r['matrixA'] = matrix(frame, state+0xa0, f'sparse-{i}-A')
        r['matrixC'] = matrix(frame, state+0xc0, f'sparse-{i}-C')
        pending = None
        if len(records) >= 3:
            for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x10040fc74, 'entry'), (0x1000daf10, 'cg_entry'), (0x1000db4d4, 'iteration'),
                              (0x1004103d8, 'cg_return'), (0x100056fe4, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
