"""Capture the first SoundboardIRCompute propagation-state entry.

Read-only hardware breakpoint.  The function's decompiled prototype has both
integer and floating arguments, so the probe records the raw registers and
pointer regions instead of assuming a source-level parameter order.
"""
import json
import hashlib
import os
from pathlib import Path
import struct
import traceback

from pianoteq_damper_runtime_capture import verify_text


ROOT = Path(os.environ["PIANOTEQ_CAPTURE_DIR"])
ENTRY = 0x1005A8874
MAX_RECORDS = 4
hook = None
records = []
errors = []


def memory(frame, address, size):
    import lldb
    error = lldb.SBError()
    data = frame.GetThread().GetProcess().ReadMemory(address, size, error)
    if error.Fail() or len(data) != size:
        raise RuntimeError(str(error))
    return data


def region(frame, address):
    import lldb
    info = lldb.SBMemoryRegionInfo()
    error = frame.GetThread().GetProcess().GetMemoryRegionInfo(address, info)
    if error.Fail():
        return {"error": str(error)}
    return {
        "base": info.GetRegionBase(),
        "end": info.GetRegionEnd(),
        "readable": info.IsReadable(),
        "writable": info.IsWritable(),
        "mapped": info.IsMapped(),
    }


def peek(frame, address, size=0x200):
    if not (0x1000 <= address < 0x8000000000):
        return None
    try:
        data = memory(frame, address, size)
        words = list(struct.unpack("<" + "Q" * min(size // 8, 32), data[:min(size, 0x100)]))
        return {
            "address": address,
            "region": region(frame, address),
            "hex": data.hex() if size <= 0x200 else None,
            "words": words,
        }
    except RuntimeError as error:
        return {"address": address, "error": str(error)}


def dump_state_arrays(frame, s_data):
    if os.environ.get("PIANOTEQ_DUMP_STATE_ARRAYS") != "1":
        return []
    descriptors = (
        (0x18, "v18"), (0x30, "v30"), (0x48, "v48"), (0x70, "v70"),
        (0x88, "v88"), (0xA0, "va0"), (0xC0, "vc0"), (0xE0, "ve0"),
        (0xF8, "vf8"), (0x110, "v110"), (0x158, "v158"), (0x198, "v198"),
    )
    dumped = []
    for offset, label in descriptors:
        begin, end, capacity = struct.unpack_from("<3Q", s_data, offset)
        if not (0x1000 <= begin <= end <= 0x8000000000):
            continue
        length = end - begin
        if length == 0 or length > 0x400000:
            continue
        try:
            data = memory(frame, begin, length)
        except RuntimeError as error:
            dumped.append({"offset": offset, "label": label, "error": str(error)})
            continue
        path = ROOT / f"state-{label}.bin"
        path.write_bytes(data)
        os.chmod(path, 0o600)
        dumped.append({
            "offset": offset,
            "label": label,
            "begin": begin,
            "end": end,
            "capacity": capacity,
            "bytes": len(data),
            "floatCount": len(data) // 4,
            "sha256": hashlib.sha256(data).hexdigest(),
            "path": str(path),
        })
        if label in ("va0", "vc0"):
            rows = []
            for row_index in range(len(data) // 0x20):
                begin, end, capacity = struct.unpack_from(
                    "<3Q", data, row_index * 0x20
                )
                if begin == 0 and end == 0:
                    rows.append({"row": row_index, "entries": []})
                    continue
                if not (0x1000 <= begin <= end <= 0x8000000000):
                    rows.append({
                        "row": row_index,
                        "error": f"invalid range {begin:#x}..{end:#x}",
                    })
                    continue
                length = end - begin
                if length % 0x10 != 0 or length > 0x100000:
                    rows.append({
                        "row": row_index,
                        "error": f"invalid sparse length {length:#x}",
                    })
                    continue
                raw = memory(frame, begin, length)
                entries = []
                for entry_index in range(length // 0x10):
                    index_low, index_high, value_low_bits, value_high_bits = struct.unpack_from(
                        "<IIII", raw, entry_index * 0x10
                    )
                    value_low = struct.unpack("<f", struct.pack("<I", value_low_bits))[0]
                    value_high = struct.unpack("<f", struct.pack("<I", value_high_bits))[0]
                    entries.append({
                        "indexLow": index_low,
                        "indexHigh": index_high,
                        "valueLow": value_low,
                        "valueHigh": value_high,
                    })
                rows.append({
                    "row": row_index,
                    "capacity": capacity,
                    "entries": entries,
                })
            sparse_path = ROOT / f"state-{label}-rows.json"
            sparse_path.write_text(json.dumps({
                "schema": 1,
                "label": label,
                "rowStride": 0x20,
                "entryStride": 0x10,
                "rows": rows,
            }, separators=(",", ":"), allow_nan=False))
            os.chmod(sparse_path, 0o600)
            dumped[-1]["rowsPath"] = str(sparse_path)
            dumped[-1]["nonzeroRows"] = sum(bool(row.get("entries")) for row in rows)
            dumped[-1]["entryCount"] = sum(len(row.get("entries", [])) for row in rows)
    return dumped


def save(exit_status=None):
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "runtime.json").write_text(json.dumps({
        "schema": 1,
        "entry": hex(ENTRY),
        "records": records,
        "errors": errors,
        "hits": hook.GetHitCount() if hook else 0,
        "exitStatus": exit_status,
    }, indent=2, allow_nan=False))


def on_entry(frame, breakpoint, _):
    try:
        registers = {}
        for name in ("x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8",
                     "w9", "w10", "w11"):
            register = frame.FindRegister(name)
            try:
                registers[name] = register.GetValueAsUnsigned()
            except Exception:
                registers[name] = register.GetValueAsSigned()
        for name in ("s0", "s1", "s2", "s3", "s4", "s5"):
            import lldb
            error = lldb.SBError()
            registers[name] = frame.FindRegister(name).GetData().GetFloat(error, 0)
            if error.Fail():
                raise RuntimeError(str(error))
        record = {
            "thread": frame.GetThread().GetThreadID(),
            "registers": registers,
            "peeks": {},
        }
        for name in ("x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7"):
            value = registers[name]
            record["peeks"][name] = peek(frame, value)
        s_data = memory(frame, registers["x0"], 0x200)
        s_peeks = {}
        for offset in range(0x18, 0x1D0, 8):
            pointer = struct.unpack_from("<Q", s_data, offset)[0]
            if 0x1000 <= pointer < 0x8000000000:
                s_peeks[hex(offset)] = peek(frame, pointer, 0x100)
        record["statePointers"] = s_peeks
        if len(records) == 0:
            record["stateArrays"] = dump_state_arrays(frame, s_data)
        records.append(record)
        save()
        if breakpoint.GetHitCount() >= MAX_RECORDS:
            breakpoint.SetEnabled(False)
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def launch_and_run(debugger, argv, max_stops=4096):
    import lldb
    target = debugger.GetSelectedTarget()
    launch_info = lldb.SBLaunchInfo(argv)
    launch_info.SetLaunchFlags(lldb.eLaunchFlagStopAtEntry | lldb.eLaunchFlagDisableASLR)
    error = lldb.SBError()
    target.Launch(launch_info, error)
    if error.Fail():
        raise RuntimeError(str(error))
    process = target.GetProcess()
    stops = 0
    while process.GetState() == lldb.eStateStopped:
        stops += 1
        if stops > max_stops:
            raise RuntimeError("Too many callback-owned stops")
        error = process.Continue()
        if error.Fail():
            raise RuntimeError(str(error))
    save(exit_status=process.GetExitStatus())
    return {
        "stops": stops,
        "state": process.GetState(),
        "exitStatus": process.GetExitStatus(),
        "records": len(records),
        "errors": len(errors),
    }


def __lldb_init_module(debugger, _):
    import lldb
    global hook
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (ROOT / "runtime.json").exists(), "Use a fresh output directory"
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        f'breakpoint set --hardware --address {ENTRY:#x} --shlib "Pianoteq 9"',
        result,
    )
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + ".on_entry")
    hook.SetAutoContinue(True)
    save()
