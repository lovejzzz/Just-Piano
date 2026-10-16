#!/usr/bin/env python3
"""Strict factory-bank 66/67 and full A78/A79/FX record boundary decoder.

Defaults to structural summaries. --include-values writes proprietary values
only to an explicitly selected private local output. No app writes or audio host.
B model decoding delegates to the bounded resource reader. Extra resource
bodies and bank footers retain their explicit opaque byte ranges.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


def load_sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fxp = load_sibling('pianoteq_fxp_bank_schema', 'pianoteq-inspect-fxp.py')
resource = load_sibling('pianoteq_resource_bank_schema', 'pianoteq-resource-inventory.py')


def read_a_tail(reader, state_version):
    """Strict 78/79 schema: native <0x4f omits only A+f28 among these versions."""
    if state_version not in (78, 79):
        raise ValueError("unsupported A model version")
    start = reader.pos
    fields = []
    def field(offset, kind):
        if state_version == 78 and offset == 0xf28:
            return  # Native 100560cc0 assigns default0, consumes no bytes.
        begin = reader.pos
        if kind == 'curve':
            value = fxp.read_curve(reader)
        elif kind == 'f32':
            value = fxp.read_float(reader)
        elif kind == 'u32':
            value = reader.u32()
        elif kind in ('vector_f', 'vector_I'):
            value = fxp.read_vector(reader, kind[-1])
        elif kind == 'release':
            value = fxp.read_release_config(reader)
        elif kind == 'tuning':
            value = fxp.read_tuning(reader)
        elif kind == 'index_curve':
            value = fxp.read_index_curve(reader)
        elif kind == 'effect':
            value = fxp.read_effect(reader)
        elif kind == 'control470':
            value = fxp.read_control_470(reader)
        elif kind == 'control588':
            value = fxp.read_control_588(reader)
        elif kind == 'control9a8':
            value = fxp.read_control_9a8(reader)
        elif kind in ('1450', '1470', '1590', '15a8', '174c'):
            value = getattr(fxp, 'read_' + kind)(reader)
        elif kind == 'effect_slot':
            value = fxp.read_effect_slot(reader)
        elif kind == 'output':
            value = fxp.read_output(reader)
        elif kind == 'named_pairs':
            value = fxp.read_named_pairs(reader)
        elif kind == 'float13_int2':
            version = reader.u32()
            if version > 1: raise ValueError('unsupported final config')
            value = {'version': version, 'floats': [fxp.read_float(reader) for _ in range(13)],
                     'integers': [reader.u32(), reader.u32()]}
        else:
            raise ValueError(kind)
        fields.append({'object_offset': offset, 'kind': kind, 'offset': begin,
                       'end_offset': reader.pos, 'value': value})
    metadata = fxp.read_pair_metadata(reader)
    field(0x1028, 'f32')
    field(0x1030, 'curve')
    for offset, kind in [(0x1530, 'vector_I'), (0x1548, 'vector_f'),
                         (0x1560, 'vector_f'), (0x1578, 'vector_I'),
                         (0x1080, 'f32'), (0x1084, 'u32'), (0x10a8, 'u32'),
                         (0x10ac, 'f32'), (0x1110, 'f32'), (0x1118, 'curve'),
                         (0x1100, 'release'), (0x1168, 'f32'), (0x116c, 'f32'),
                         (0x1170, 'curve'), (0x11c0, 'u32'),
                         (0x1218, 'f32'), (0x121c, 'f32'), (0x1270, 'release'),
                         (0x1280, 'f32'), (0x1288, 'curve'), (0x12e0, 'curve'),
                         (0x1330, 'u32'), (0x1398, 'f32'), (0x139c, 'u32'),
                         (0x13a4, 'u32'), (0x13a8, 'f32'), (0x13b0, 'curve'),
                         (0x1400, 'curve'), (0x464, 'u32'), (0x13a0, 'f32'),
                         (0x1334, 'f32'), (0x10b0, 'curve'), (0x1220, 'curve'),
                         (0x1338, 'curve')]:
        field(offset, kind)
    field(0x1388, 'release')
    field(0x318, 'tuning')
    for offset, kind in [(0x3a8, 'u32'), (0x3b0, 'curve'), (0x3ac, 'u32'),
                         (0x45c, 'u32'), (0x46c, 'f32'), (0x468, 'u32'),
                         (0x460, 'u32'), (0x400, 'index_curve'),
                         (0x458, 'f32'), (0x690, 'f32'), (0x698, 'curve'),
                         (0x6e8, 'curve'), (0x788, 'curve'), (0x738, 'curve'),
                         (0x7d8, 'f32'), (0x7e0, 'curve'), (0x7dc, 'f32'),
                         (0x830, 'curve'), (0x880, 'release'), (0x890, 'release'),
                         (0x8a0, 'f32'), (0x8a8, 'curve'), (0x8f8, 'f32'),
                         (0x900, 'curve'), (0x950, 'f32'), (0x958, 'curve'),
                         (0xc80, 'f32'), (0xc88, 'curve'), (0xcd8, 'f32'),
                         (0xce0, 'curve'), (0xd30, 'curve'), (0xd80, 'u32'),
                         (0xd88, 'curve'), (0xdd8, 'curve'), (0xe28, 'curve'),
                         (0xe78, 'curve'), (0xec8, 'f32'), (0xed0, 'curve'),
                         (0xf34, 'u32'), (0xf38, 'f32'), (0xf3c, 'u32'),
                         (0xf20, 'f32'), (0xf24, 'f32'), (0xf2c, 'f32'),
                         (0xf28, 'f32'), (0xf30, 'u32'), (0xf40, 'f32'),
                         (0xf48, 'curve'), (0xf98, 'f32'), (0x11c4, 'f32'),
                         (0x11c8, 'curve')]:
        field(offset, kind)
    field(0xfa0, 'effect')
    for offset, kind in [(0x1748, 'f32'), (0x1018, 'f32'), (0x101c, 'f32'),
                         (0x1020, 'f32'), (0x1024, 'u32'),
                         (0x470, 'control470'), (0x588, 'control588')]:
        field(offset, kind)
    field(0x9a8, 'control9a8')
    for offset, kind in [(0x1450, '1450'), (0x1470, '1470'), (0x1518, 'vector_I'),
                         (0x1590, '1590'), (0x1598, 'u32'), (0x159c, 'u32'),
                         (0x15a0, 'u32'), (0x15a4, 'u32'), (0x15a8, '15a8'),
                         (0x16d0, 'effect_slot'), (0x16f8, 'effect_slot'),
                         (0x1720, 'effect_slot'), (0x174c, '174c')]:
        field(offset, kind)
    field(0x1760, 'output')
    field(0x17c8, 'named_pairs')
    field(0x183c, 'u32')
    if fields[-1]['value'] != 0:
        field(0x17fc, 'float13_int2')
    return {'offset': start, 'end_offset': reader.pos, 'metadata': metadata,
            'fields': fields, 'next_unknown_reader': None if reader.pos == reader.end else 'unexpected_suffix'}



def require(value, expected, label):
    if value != expected:
        raise ValueError(f'{label}: got {value!r}, expected {expected!r}')


def complete(reader, label):
    if reader.pos != reader.end:
        raise ValueError(f'{label}: unconsumed {reader.end-reader.pos} bytes at {reader.pos:#x}')


def read_boolean(reader):
    byte=reader.take(1)[0]
    return {'encoded_byte':byte,'value':byte not in (0,0x30,0x46)}


def read_prom(reader):
    require(reader.u32(),1,'prom identity-list version')
    require(reader.u32(),1,'observed prom identity count')
    require(reader.u32(),1,'prom identity-entry version')
    identity=[reader.string() for _ in range(3)]
    weight=fxp.read_float(reader)
    require(reader.u32(),6,'prom config-list version')
    require(reader.u32(),0,'observed empty prom configuration-record vector')
    value={'identity':identity,'weight':weight,'configuration_name':reader.string(),
           'scalars':[fxp.read_float(reader),fxp.read_float(reader)],
           'indices':fxp.read_vector(reader,'I'),
           'booleans':[read_boolean(reader),read_boolean(reader)],
           'selection':reader.u32(),'identifier_hex':reader.take(16).hex()}
    complete(reader,'prom')
    return value


def read_olos(reader):
    require(reader.u32(),1,'olos version')
    require(reader.u32(),1,'olos shared model version')
    flag=read_boolean(reader)
    if flag['value']:
        raise ValueError('nonempty olos model not yet supported')
    mode,channel=reader.u32(),reader.u32()
    if mode>=3 or channel>=10:raise ValueError('olos mode/channel outside native bounds')
    complete(reader,'olos')
    return {'shared_model':None,'encoded_presence':flag,'mode':mode,'channel':channel}


def read_ryal(reader, include_values=False, depth=0):
    require(reader.u32(),2,'ryal version')
    count=reader.u32()
    if count>1000:raise ValueError('excessive layer count')
    layers=[]
    for _ in range(count):
        require(reader.u32(),3,'observed layer version')
        gain=fxp.read_float(reader)
        require(reader.u32(),1,'layer base version')
        strings=[reader.string(),reader.string()]
        require(reader.u32(),1,'layer shared model version')
        flag=read_boolean(reader)
        model=None
        if flag['value']:
            inner,_=reader.chunk('rpue')
            model=read_a_state(inner,include_values=include_values,depth=depth+1)
        channel,transpose=reader.u32(),reader.u32()
        channel=channel if channel<2**31 else channel-2**32
        transpose=transpose if transpose<2**31 else transpose-2**32
        if not -1<=channel<=15 or not -127<=transpose<=127:
            raise ValueError('layer channel/transpose outside native bounds')
        layers.append({'gain':gain,'strings':strings,'encoded_presence':flag,
                       'model':model,'channel':channel,'transpose':transpose,
                       'boolean':read_boolean(reader)})
    value={'layers':layers,'name':reader.string(),'selection':reader.u32()}
    complete(reader,'ryal')
    return value


def read_a_state(body, version=None, include_values=False, depth=0):
    if depth>16:raise ValueError('excessive nested model depth')
    state_start=body.pos if version is None else body.pos-4
    version=body.u32() if version is None else version
    if version not in (78,79):raise ValueError(f'unsupported A version {version}')
    identity=[body.string() for _ in range(3)]
    flags,branch=body.u32(),body.u32()
    if flags not in (0,32):raise ValueError(f'unsupported observed detailed A flags {flags}')
    require(branch,0,'A detailed branch')
    identity_chunks=[];nested_values={}
    for tag in ['prom','ryal','olos']:
        nested,summary=body.chunk(tag)
        if tag=='prom':nested_values[tag]=read_prom(nested)
        elif tag=='ryal':nested_values[tag]=read_ryal(nested,include_values,depth)
        else:nested_values[tag]=read_olos(nested)
        summary['decoded']=True
        identity_chunks.append(summary)
    details=read_a_tail(body,version)
    complete(body,'A model state')
    nested_models=[x['model'] for x in nested_values['ryal']['layers'] if x['model'] is not None]
    nested_count=sum(1+x['nested_A_count'] for x in nested_models)
    result={'state_version':version,'flags':flags,'model_identity':identity[0],
            'identity_components':identity,'prom_identity_components':nested_values['prom']['identity'],
            'layer_references':[{'strings':layer['strings'],
                'embedded_identity_components':layer['model']['identity_components'] if layer['model'] else None}
                for layer in nested_values['ryal']['layers']],
            'state_start':state_start,'end_offset':body.pos,'unparsed_state_bytes':0,'nested_A_count':nested_count,
            'layer_count':len(nested_values['ryal']['layers']),
            'identity_chunks':identity_chunks,
            'loader_assigned_defaults':{'A+f28':0.0} if version==78 else {}}
    result.update(fxp.summarize_tail(details))
    if include_values:
        result.update(identities=identity,detailed_state=details,nested_values=nested_values)
    return result


def decode_preset(body, include_values=False):
    name,kind=body.string(),body.u32()
    author,comment=body.string(),body.string()
    extra_length=body.u32();extra=body.take(extra_length)
    version=body.u32()
    branch_details=None;model=None
    if kind==0:
        model=read_a_state(body,version,include_values)
    elif (kind,version)==(100,2):
        branch_details={'effect_slot':fxp.read_effect_slot(body)}
    elif (kind,version)==(4,1):
        branch_details={'effect':fxp.read_effect(body)}
    elif (kind,version)==(3,3):
        branch_details={'A+1020':fxp.read_float(body),'A+1080':fxp.read_float(body),
                        'A+1024':body.u32(),'output':fxp.read_output(body)}
        require(branch_details['output']['kind'],3,'FX output kind')
    else:raise ValueError(f'unsupported factory type/version {(kind,version)}')
    complete(body,f'preset {name}')
    result={'name':name,'type':kind,'state_version':version,
            'end_offset':body.pos,'unparsed_state_bytes':0,'extra_bytes':extra_length}
    if model:result.update(model)
    elif not include_values:result['branch_structure']={'schema':{100:'effect_slot',4:'effect',3:'output'}[kind]}
    if include_values:result.update(author=author,comment=comment,extra_hex=extra.hex(),branch_details=branch_details)
    return result


def inspect_bank(data, name, include_values=False):
    reader = fxp.Reader(data)
    header = [reader.u32() for _ in range(3)]
    require(header[0], 0x01020305, 'bank magic')
    require(header[2], 1, 'bank type')
    if header[1] not in (66,67):
        raise ValueError('only explicitly audited bank66/67 paths supported')
    expected = [0xf38cc100,0xf38cb100,0xa46e8f22,0x19475024,0x56710d03,0x56710d02]
    chunks, models, presets, extras = [], [], [], []
    for expected_tag in expected:
        start = reader.pos
        require(reader.u32(), expected_tag, 'bank block')
        length = reader.u32()
        body = fxp.Reader(data,reader.pos,reader.pos+length)
        reader.take(length)
        chunks.append({'tag':hex(expected_tag),'offset':start,'bytes':length,'end_offset':reader.pos})
        if expected_tag == 0xf38cc100:
            metadata = {'strings':[body.string(),body.string()],'build':body.u32()}
        elif expected_tag == 0xf38cb100:
            count = body.u32()
            if count>1000:raise ValueError('excessive B model count')
            for _ in range(count):
                begin=body.pos
                require(body.u32(),0x89238742,'B record magic')
                size=body.u32();record=fxp.Reader(data,body.pos,body.pos+size);body.take(size)
                identity,source=record.string(),record.string();model_start=record.pos
                version=record.u32()
                models.append({'identity':identity,'source':source,'offset':begin,'bytes':size,
                    'model_start':model_start,'version':version,'end_offset':record.end,
                    'unparsed_model_body_bytes':record.end-record.pos})
                # Decode only branches supported by the separately owned B parser.
                # Rejection here never turns an opaque B extent into a decoded model.
                try:
                    base=resource.read_base_prefix(data,model_start,record.end,fxp)
                    models[-1].update(decoded_prefix_end=base['next_offset'],
                        unparsed_suffix_bytes=base['unparsed_suffix_bytes'],
                        unparsed_model_body_bytes=base['unparsed_suffix_bytes'],
                        fully_decoded=base['next_offset']==record.end,
                        decoded_field_count=len(base['fields']))
                    if include_values:models[-1]['decoded_values']=base
                except ValueError as error:
                    models[-1].update(fully_decoded=False,decode_error=str(error))
                record.take(record.end-record.pos)
        elif expected_tag == 0xa46e8f22:
            require(body.u32(),1,'compound model list version')
            require(body.u32(),0,'observed empty compound model list')
        elif expected_tag == 0x19475024:
            count=body.u32()
            if count>10000:raise ValueError('excessive preset count')
            for _ in range(count):
                begin=body.pos;require(body.u32(),0x83f873a7,'preset magic')
                size=body.u32();record=fxp.Reader(data,body.pos,body.pos+size);body.take(size)
                decoded=decode_preset(record,include_values)
                decoded.update(offset=begin,body_offset=begin+8,bytes=size)
                presets.append(decoded)
        elif expected_tag == 0x56710d03:
            require(body.u32(),0,'observed empty auxiliary map')
        elif expected_tag == 0x56710d02:
            count=body.u32()
            if count>1000:raise ValueError('excessive extra-resource count')
            for _ in range(count):
                key=body.string();end=body.u32();begin=body.pos
                if not begin<=end<=body.end:raise ValueError('invalid absolute resource end')
                magic=body.take(4);version=body.u32()
                extras.append({'name':key,'magic':magic.hex(),'version':version,'offset':begin,
                               'end_offset':end,'unparsed_body_bytes':end-body.pos})
                body.take(end-body.pos)
        complete(body,f'chunk {expected_tag:#x}')
    footer_offset=reader.pos
    # Footer contents are opaque; the FX bank has an additional bounded word.
    # This word is reported, never silently skipped or assigned a semantic role.
    opaque_prefix=None
    if name=='builtin_presets_fx.dat':
        require(reader.end-reader.pos,192,'observed FX trailer extent')
        opaque_prefix=reader.u32()
    footer_length=reader.u32()
    require(footer_length,184,'observed footer extent')
    footer=reader.take(footer_length)
    complete(reader,'bank')
    return {'header':header,'bank_bytes':len(data),'chunks':chunks,'models':models,
            'presets':presets,'additional_resources':extras,'footer_offset':footer_offset,
            'footer_bytes':footer_length,'footer_opaque_prefix':opaque_prefix,
            'footer_sha256':hashlib.sha256(footer).hexdigest(),'unconsumed_bank_bytes':0,
            'all_B_models_fully_decoded':bool(models) and all(m.get('fully_decoded',False) for m in models)}


def inspect(path,include_values=False):
    inventory=resource.inspect(path)
    raw=path.read_bytes();data=bytes(x^0x55 for x in raw)
    banks=[];failures=[]
    for row in inventory['members']:
        if not row['name'].startswith('builtin_presets_') or not row['name'].endswith('.dat'):continue
        try:
            result=inspect_bank(data[row['offset']:row['offset']+row['bytes']],row['name'],include_values)
            result.update(name=row['name'],member_offset=row['offset'],member_md5=row['md5'])
            banks.append(result)
        except Exception as error:
            failures.append({'bank':row['name'],'error':str(error)})
    return {'resource_sha256':inventory['sha256'],'member_md5_verified':inventory['verified_member_md5_count'],
            'banks':banks,'failures':failures,'complete_A_count':sum(p['type']==0 for b in banks for p in b['presets']),
            'nested_A_count':sum(p.get('nested_A_count',0) for b in banks for p in b['presets']),
            'complete_FX_count':sum(p['type']!=0 for b in banks for p in b['presets']),
            'bank_count':len(banks),
            'B_model_count':sum(len(b['models']) for b in banks),
            'fully_decoded_B_count':sum(m.get('fully_decoded',False) for b in banks for m in b['models']),
            'all_B_models_fully_decoded':bool(banks) and all(m.get('fully_decoded',False) for b in banks for m in b['models'])}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--include-values',action='store_true',help='Private local research output only')
    args=parser.parse_args()
    if args.include_values and args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error('Commercial values must be written outside the repository')
    result=inspect(args.path,args.include_values)
    args.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    if args.include_values:
        args.output.chmod(0o600)
    print(json.dumps({k:v for k,v in result.items() if k!='banks'},indent=2))
    raise SystemExit(1 if result['failures'] else 0)


if __name__=='__main__':main()
