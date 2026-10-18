#!/usr/bin/env python3
"""Decode selected soundboard model/preset inputs to a NEW private JSON file."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


def load(name,filename):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(filename))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('resource',type=Path);parser.add_argument('bank');parser.add_argument('identity')
    parser.add_argument('preset',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):parser.error('Commercial inputs must remain outside the repository')
    if args.output.exists():parser.error('Fresh private output required')
    factory=load('soundboard_factory_archive','pianoteq_factory_banks.py')
    inventory=factory.resource.inspect(args.resource)
    members=[m for m in inventory['members'] if m['name']==args.bank]
    if len(members)!=1:raise ValueError('Unique factory bank required')
    member=members[0];raw=args.resource.read_bytes();decoded=bytes(x^0x55 for x in raw[member['offset']:member['offset']+member['bytes']])
    bank=factory.inspect_bank(decoded,args.bank,include_values=True)
    models=[m for m in bank['models'] if m.get('decoded_values',{}).get('strings',[None])[0]==args.identity]
    if len(models)!=1 or not models[0].get('fully_decoded'):raise ValueError('Unique completely decoded base archive required')
    model=models[0];base=model['decoded_values'];fields=[f for f in base['fields'] if f['object_offset']==0x3d68]
    if base['version']!=89 or len(fields)!=1 or fields[0]['kind']!='filters':raise ValueError('Supported soundboard archive field required')
    preset=factory.fxp.inspect(args.preset,True)
    selected=[f for f in preset['decoded_tail']['fields'] if f['object_offset'] in (0xf98,0x1018,0x1020,0x1024)]
    if len(selected)!=4:raise ValueError('Complete preset scalar source fields required')
    result={'schema':1,'identity':args.identity,'baseVersion':base['version'],'soundboards':fields[0]['value'],
        'presetFields':selected,'sources':{'resourceSha256':inventory['sha256'],'verifiedMemberCount':inventory['verified_member_md5_count'],
            'bank':args.bank,'bankMd5':member['md5'],'modelArchiveOffset':model['offset'],'modelArchiveBytes':model['bytes'],
            'presetSha256':preset['sha256']},'commercialInputsPrivate':True}
    with args.output.open('x') as out:json.dump(result,out,indent=2);out.write('\n')
    args.output.chmod(0o600)
    print(json.dumps({'identity':args.identity,'components':len(result['soundboards']['filters']),
        'resourceSha256':inventory['sha256'],'presetSha256':preset['sha256'],'outputSha256':hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__=='__main__':main()
