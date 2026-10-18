import importlib.util,struct
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'scripts/pianoteq_decode_release_resource.py'
spec=importlib.util.spec_from_file_location('release_decode',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def bank(next_pos=0,kind=2,codec=2,offset=80):
 b=bytearray(96);b[:8]=b'KVR2\x01\x00\x00\x00';struct.pack_into('<4If5I',b,8,next_pos,kind,0,44100,1.0,1,8,codec,4,offset);b[80:84]=b'fLaC';return b
r=m.parse_kvr_records(bank(),0,48);assert len(r)==1 and r[0]['offset']==80
# Payloads may be shared across extra-record boundaries, but stay in the bank.
for b in [bank(next_pos=8),bank(next_pos=48),bank(kind=0),bank(codec=1),bank(offset=94),bank()[:40]]:
 try:m.parse_kvr_records(b,0,min(48,len(b)))
 except ValueError:pass
 else:raise AssertionError('Malformed KVR accepted')
print('KVR version, linked-index cycle/bounds, type/codec and shared payload bounds passed')
