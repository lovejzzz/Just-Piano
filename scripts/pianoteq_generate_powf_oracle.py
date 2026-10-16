"""Generate a deterministic independent system powf oracle, without target data."""
import argparse,json,pathlib,random,struct,subprocess
parser=argparse.ArgumentParser();parser.add_argument('oracle',type=pathlib.Path);parser.add_argument('output',type=pathlib.Path);args=parser.parse_args()
assert args.oracle.is_file() and not args.output.exists()
rng=random.Random(70)
def bits(x):return struct.unpack('<I',struct.pack('<f',x))[0]
pairs=[]
for i in range(60000):pairs.append([bits(rng.uniform(1/127,1.2)),bits(rng.uniform(-6,6))])
for i in range(40000):pairs.append([rng.randrange(1,0x7f800000),bits(rng.uniform(-200,200))])
for i in range(10000):pairs.append([bits(-10**rng.uniform(-5,5)),bits(rng.randrange(-40,41))])
for i in range(10000):pairs.append([rng.randrange(1,0x800000),bits(rng.uniform(-3,3))])
for a in [0,0x80000000,1,0x800000,0x3f800000,0xbf800000,0x7f800000,0xff800000,0x7fc00000,0x7f7fffff]:
 for b in [0,0x80000000,bits(1),bits(-1),bits(.5),bits(3),bits(-3),0x7f800000,0xff800000,0x7fc00000]:pairs.append([a,b])
pairs.append([bits(.9921875),bits(1.79586660861969)])
request=''.join(f'{a:08x} {b:08x}\n' for a,b in pairs)
r=subprocess.run([str(args.oracle.resolve())],input=request,text=True,capture_output=True,check=True);values=r.stdout.splitlines();assert len(values)==len(pairs)
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps({'seed':70,'records':[[f'{a:08x}',f'{b:08x}',v] for (a,b),v in zip(pairs,values)]},separators=(',',':'))+'\n');print(len(pairs))
