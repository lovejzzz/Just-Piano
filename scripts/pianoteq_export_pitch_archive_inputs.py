#!/usr/bin/env python3
"""Export current resource/preset pitch inputs to a fresh private JSON; no native process."""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('resource',type=Path);parser.add_argument('bank');parser.add_argument('identity')
    parser.add_argument('preset',type=Path);parser.add_argument('output',type=Path)
    parser.add_argument('--note',required=True,type=float);parser.add_argument('--host-mode',required=True,type=int,choices=[0,2])
    parser.add_argument('--host-gain',required=True,type=float);parser.add_argument('--zero-cents',required=True,action='store_true');args=parser.parse_args()
    if not math.isfinite(args.note) or not math.isfinite(args.host_gain):parser.error('Finite explicit runtime conditions required')
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):parser.error('Commercial inputs must remain outside repository')
    if args.output.exists():parser.error('Fresh private output required')
    spec=importlib.util.spec_from_file_location('pitch_factory_archive',Path(__file__).with_name('pianoteq_factory_banks.py'))
    factory=importlib.util.module_from_spec(spec);spec.loader.exec_module(factory)
    inventory=factory.resource.inspect(args.resource);members=[m for m in inventory['members'] if m['name']==args.bank]
    if len(members)!=1:raise ValueError('Unique source bank required')
    member=members[0];raw=args.resource.read_bytes();payload=bytes(x^0x55 for x in raw[member['offset']:member['offset']+member['bytes']])
    bank=factory.inspect_bank(payload,args.bank,include_values=True)
    candidates=[m for m in bank['models'] if m.get('decoded_values',{}).get('strings',[None])[0]==args.identity]
    if len(candidates)!=1 or not candidates[0].get('fully_decoded'):raise ValueError('Unique completely decoded model required')
    base=candidates[0]['decoded_values'];preset=factory.fxp.inspect(args.preset,True)
    if base['version']!=89 or not isinstance(preset['model']['identity'],list) or len(preset['model']['identity'])!=3 or preset['model']['identity'][0]!=args.identity:raise ValueError('Supported matching model/preset identity required')
    selected=[]
    for field in base['fields']:
        if field['object_offset'] not in [0x158,0x168,0x1788,0x1a80,0x2f10]:continue
        if field['object_offset']==0x2f10:
            nested=[r for r in field['value']['fields'] if r['object_offset'] in [0xb80,0xbd0]]
            if len(nested)!=2:raise ValueError('Complete nested pitch curves required')
            selected.append({'object_offset':0x2f10,'value':{'fields':nested}})
        else:selected.append(field)
    preset_fields=[]
    for field in preset['decoded_tail']['fields']:
        if field['object_offset'] in [0xc80,0xc88,0x1084]:preset_fields.append(field)
        elif field['object_offset']==0x9a8:
            value=field['value'];preset_fields.append({'object_offset':0x9a8,'value':{'version':value['version'],'scalars':value['scalars']}})
    if len(selected)!=5 or len(preset_fields)!=4:raise ValueError('Complete pitch/velocity archive fields required')
    result={'schema':'pianoteq-archive-voice-pitch-inputs-v2','note':args.note,'modelIdentity':args.identity,'baseVersion':base['version'],
        'baseFields':selected,'presetFields':preset_fields,'runtimeCurveMode':'linear-clamp',
        'velocityRuntime':{'hostMode':args.host_mode,'host2fe0':args.host_gain},'zeroCentsRuntimeBranchExplicit':args.zero_cents,
        'velocityProducerControlsFromArchive':True,'presetPath':str(args.preset.resolve()),'presetSha256':preset['sha256'],
        'sources':{'resourceSha256':inventory['sha256'],'bank':args.bank,'bankMd5':member['md5'],'verifiedMemberCount':inventory['verified_member_md5_count']},
        'commercialInputsPrivate':True}
    with open(args.output,'x',opener=lambda p,f:os.open(p,f,0o600)) as out:json.dump(result,out,indent=2);out.write('\n')
    print(json.dumps({'identity':args.identity,'note':args.note,'resourceSha256':inventory['sha256'],'presetSha256':preset['sha256'],'baseFields':len(selected),'presetFields':len(preset_fields)}))


if __name__=='__main__':main()
