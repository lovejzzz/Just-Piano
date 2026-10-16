"""Original five-strike stimulus; CC64 drives a preset's reassigned Rattle pedal."""
import argparse
from pathlib import Path
from pianoteq_write_repeat_fixture import vlq

def fixture(zero=False):
    events=[(0,[0xb0,64,32]),(96,[0x90,69,96]),(160,[0xb0,64,64]),
            (192,[0x80,69,0]),(210,[0x90,69,96]),(230,[0x80,69,0]),
            (240,[0xb0,64,96]),(260,[0x90,69,96]),(280,[0x80,69,0]),
            (300,[0x90,69,96]),(320,[0xb0,64,127]),(350,[0x80,69,0]),
            (400,[0xb0,64,0]),(420,[0x90,69,96]),(480,[0x80,69,0]),
            (960,[0xff,0x2f,0])]
    if zero:
        events=[(tick,[0xb0,64,0] if message[:2]==[0xb0,64] else message) for tick,message in events]
    track=bytearray();previous=0
    for tick,message in events:
        track+=vlq(tick-previous)+bytes(message);previous=tick
    return b'MThd'+(6).to_bytes(4,'big')+bytes.fromhex('0000000101e0')+b'MTrk'+len(track).to_bytes(4,'big')+track

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('output',type=Path);parser.add_argument('--zero',action='store_true',help='Keep timings/notes, set all Rattle CC values to zero');args=parser.parse_args()
    with args.output.open('xb') as output:output.write(fixture(args.zero))
