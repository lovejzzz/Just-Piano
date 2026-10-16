"""Verify actual exp-weight clamp and modal amplitude multiplication."""
import argparse
import json
from pathlib import Path
import struct


def f32(x):return struct.unpack('<f',struct.pack('<f',x))[0]
def bits(x):return struct.pack('<f',x)


def verify(data):
    assert data['records'] and not data['errors']
    rows=data['records'];threshold=struct.unpack('<d',struct.pack('<Q',0x3e112e0be826d695))[0]
    weight_errors=sum(bits(0 if r['weight_raw']<threshold else r['weight_raw'])!=bits(r['weight_applied']) for r in rows)
    product_errors=sum(bits(f32(r['weight_applied']*r['amplitude_before']))!=bits(r['amplitude_after']) for r in rows)
    return {'records':len(rows),'threshold':threshold,'weight_bit_mismatches':weight_errors,
        'product_bit_mismatches':product_errors,'nonzero_products':sum(r['amplitude_after']!=0 for r in rows),
        'examples':rows[:3],'passed':weight_errors==0 and product_errors==0}


if __name__=='__main__':
    p=argparse.ArgumentParser(__doc__);p.add_argument('capture',type=Path);p.add_argument('--output',type=Path)
    args=p.parse_args();result=verify(json.loads(args.capture.read_text()));text=json.dumps(result,indent=2)
    if args.output:args.output.write_text(text+'\n')
    print(text);raise SystemExit(0 if result['passed'] else 1)
