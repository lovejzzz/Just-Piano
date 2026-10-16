"""Create a private test FXP with fourth-pedal assignment changed to Rattle.

Edits an ordinary user preset, never the application or its protections. Only
observed full A79/default-pedal inputs are accepted; all other bytes except the
normal preset payload checksum stay unchanged. No model values are printed.
"""
import argparse,hashlib,importlib.util,json,os,struct
from pathlib import Path

spec=importlib.util.spec_from_file_location('pianoteq_fxp_fixture_schema',Path(__file__).with_name('pianoteq-inspect-fxp.py'))
fxp=importlib.util.module_from_spec(spec);spec.loader.exec_module(fxp)

def create(source,output):
    root=Path(__file__).resolve().parents[1]
    if not output.is_absolute() or output.resolve().is_relative_to(root):
        raise ValueError('Preset output must be an absolute private path outside the repository')
    original=source.read_bytes();parsed=fxp.inspect(source,True)
    field=next(x for x in parsed['decoded_tail']['fields'] if x['object_offset']==0x1518)
    if field['kind']!='vector_I' or field['value']!=[2,3,4,1] or field['end_offset']-field['offset']!=20:
        raise ValueError('Observed four default pedal assignments required')
    data=bytearray(original);offset=field['offset']+16
    if struct.unpack_from('<I',data,offset)[0]!=1:raise ValueError('Invalid fourth pedal location')
    struct.pack_into('<I',data,offset,6)
    chunk=next(c for c in parsed['chunks'] if c['tag']=='dlla');digest_offset=chunk['header_offset']-16
    if data[digest_offset:digest_offset+16]!=hashlib.md5(original[chunk['payload_offset']:chunk['end_offset']]).digest():raise ValueError('Invalid source preset checksum')
    data[digest_offset:digest_offset+16]=hashlib.md5(data[chunk['payload_offset']:chunk['end_offset']]).digest()
    allowed=set(range(offset,offset+4))|set(range(digest_offset,digest_offset+16))
    if any(a!=b and i not in allowed for i,(a,b) in enumerate(zip(original,data))):raise ValueError('Unexpected preset edit')
    with os.fdopen(os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:f.write(data)
    verified=fxp.inspect(output,True)
    before=parsed['decoded_tail']['fields'];after=verified['decoded_tail']['fields']
    differences=[(a['object_offset'],a['value'],b['value']) for a,b in zip(before,after) if a!=b]
    if len(before)!=len(after) or differences!=[(0x1518,[2,3,4,1],[2,3,4,6])]:raise ValueError('Preset field verification failed; private output retained')
    return {'output':str(output),'sourceSha256':hashlib.sha256(original).hexdigest(),'outputSha256':hashlib.sha256(data).hexdigest(),'pedalAssignments':[2,3,4,6],'payloadChecksumVerified':True}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args();print(json.dumps(create(args.source,args.output)))
