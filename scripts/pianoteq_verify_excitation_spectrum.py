"""Verify real captured slope/base/extra-table -> log spectrum -> exp values."""
import argparse
import ctypes
import json
import math
from pathlib import Path
import struct


def f32(x):
    return struct.unpack('<f',struct.pack('<f',x))[0]


def bits(x):
    return struct.pack('<f',x)


def verify(data):
    assert data['records'] and not data['errors']
    lib=ctypes.CDLL('/usr/lib/libSystem.B.dylib')
    fma=lib.fma;fma.argtypes=[ctypes.c_double]*3;fma.restype=ctypes.c_double
    fmaf=lib.fmaf;fmaf.argtypes=[ctypes.c_float]*3;fmaf.restype=ctypes.c_float
    scale=struct.unpack('<d',struct.pack('<Q',0x3fbd791c5f888823))[0]
    mismatches=[]; examples=[]; count=0; max_exp_error=0; exp_bit_equal=0; extra_nonzero=0
    for index,r in enumerate(data['records']):
        slope=r['slope'];lo=r['lower'];hi=20.0 if slope>0 else 0.0
        for lane in range(4):
            i=4*r['block']+lane
            if i>=r['count'] or i>=len(r['coordinates']):
                continue
            k=r['coordinates'][i]
            x=f32(f32(k-1)-r['reference'])
            product=f32(slope*x)
            value=fmaf(r['base_scale'],r['base_table'][i],max(lo,min(hi,product)))
            before=value
            coordinate=f32(k-1)
            if coordinate<r['count']:
                x=max(coordinate,0.0);a=int(x);b=min(a+1,r['count']-1)
                t=f32(x-a)
                e=fmaf(f32(1-t),r['extra_table'][a],f32(t*r['extra_table'][b]))
                value=f32(fma(float(e),scale,float(value)))
                extra_nonzero+=e!=0
            actual=r['log_before'][lane]
            count+=1
            if bits(value)!=bits(actual):
                mismatches.append({'record':index,'lane':lane,'predicted':value,'actual':actual})
            predicted_exp=f32(math.exp(actual));observed_exp=r['exp_after'][lane]
            max_exp_error=max(max_exp_error,abs(predicted_exp-observed_exp))
            exp_bit_equal+=bits(predicted_exp)==bits(observed_exp)
            if len(examples)<6:
                examples.append({'record':index,'mode':i,'coordinate':k,'slope':slope,
                                 'base_scale':r['base_scale'],'base':r['base_table'][i],
                                 'log_before_extra':before,'predicted_log':value,
                                 'actual_log':actual,'predicted_exp':predicted_exp,'actual_exp':observed_exp})
    return {'records':len(data['records']),'compared_log_values':count,
            'log_bit_mismatches':len(mismatches),'first_mismatches':mismatches[:8],
            'nonzero_extra_contributions':extra_nonzero,
            'exp_bit_equal':exp_bit_equal,'max_exp_absolute_error':max_exp_error,
            'examples':examples,'passed':count>0 and not mismatches and max_exp_error<=2**-22}


if __name__=='__main__':
    p=argparse.ArgumentParser(__doc__);p.add_argument('capture',type=Path);p.add_argument('--output',type=Path)
    args=p.parse_args();result=verify(json.loads(args.capture.read_text()));text=json.dumps(result,indent=2)
    if args.output:args.output.write_text(text+'\n')
    print(text);raise SystemExit(0 if result['passed'] else 1)
