#!/usr/bin/env python3
"""Decode the explicit mono NY release resource from current bank bytes; stdout is private JSON."""
import base64,hashlib,importlib.util,json,struct,subprocess,sys
from pathlib import Path
def parse_kvr_records(bank,start,end):
 if not 0<=start<=end<=len(bank) or bank[start:start+8]!=b'KVR2\x01\x00\x00\x00':raise ValueError('Bounded KVR2 version1 required')
 pos=start+8;seen=set();records=[]
 while True:
  if pos in seen or pos<start+8 or pos+40>end:raise ValueError('Bounded acyclic KVR index required')
  seen.add(pos);next_pos,kind,key,rate,scale,channels,frames,codec,size,offset=struct.unpack_from('<4If5I',bank,pos)
  if not 1<=kind<=16 or not 1000<=rate<=16000000 or not 1<=channels<=100 or codec!=2 or offset+size>len(bank) or size<4:raise ValueError('Supported bounded KVR record required')
  records.append(dict(kind=kind,key=key,rate=rate,scale=scale,channels=channels,frames=frames,codec=codec,size=size,offset=offset))
  if next_pos==0:break
  pos=next_pos
 return records

def main():
 root=Path(__file__).resolve().parent
 spec=importlib.util.spec_from_file_location('release_factory',root/'pianoteq_factory_banks.py');factory=importlib.util.module_from_spec(spec);spec.loader.exec_module(factory)
 source=json.loads(Path(sys.argv[1]).read_bytes());resource=Path(source['resourcePath']);raw=resource.read_bytes()
 sha=lambda b:hashlib.sha256(b).hexdigest()
 if sha(raw)!=source['resourceSha256']:raise ValueError('Current resource digest required')
 member=next(r for r in factory.resource.inspect(resource)['members'] if r['name']==source['bank'])
 if member['md5']!=source['bankMd5'] or source['modelIdentity']!='steinwayny':raise ValueError('Bound NY bank required')
 bank=bytes(v^85 for v in raw[member['offset']:member['offset']+member['bytes']]);inventory=factory.inspect_bank(bank,source['bank'])
 extra=next(r for r in inventory['additional_resources'] if r['name']=='percuSTEINWAYNY.dat6dc28790')
 if bank[extra['offset']:extra['offset']+8]!=b'KVR2\x01\x00\x00\x00':raise ValueError('KVR2 version1 required')
 records=parse_kvr_records(bank,extra['offset'],extra['end_offset'])
 selected=[r for r in records if r['kind']==2 and r['key']==0]
 if len(selected)!=1:raise ValueError('Unique release source required')
 r=selected[0]
 if r['rate']!=44100 or r['channels']!=1 or r['scale']!=1:raise ValueError('Explicit mono44100 unit-scale release branch required')
 encoded=bank[r['offset']:r['offset']+r['size']]
 if encoded[:4]!=b'fLaC':raise ValueError('FLAC stream required')
 ffmpeg=Path('/opt/homebrew/bin/ffmpeg').resolve()
 result=subprocess.run([str(ffmpeg),'-v','error','-f','flac','-i','pipe:0','-f','f32le','-acodec','pcm_f32le','pipe:1'],input=encoded,capture_output=True,check=True)
 if result.stderr or len(result.stdout)!=r['frames']*4:raise ValueError('Complete error-free decoded PCM required')
 deps=[root/x for x in ['pianoteq_decode_release_resource.py','pianoteq_factory_banks.py','pianoteq-resource-inventory.py','pianoteq-inspect-fxp.py']]+[ffmpeg]
 print(json.dumps(dict(resourceSha256=source['resourceSha256'],bankMd5=source['bankMd5'],record=r,encodedSha256=sha(encoded),decodedSha256=sha(result.stdout),pcm=base64.b64encode(result.stdout).decode(),dependencies=[str(p) for p in deps])))

if __name__=='__main__':main()
