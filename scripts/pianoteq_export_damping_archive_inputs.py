#!/usr/bin/env python3
"""Export current model/preset damping fields to a fresh private JSON."""
import argparse
import importlib.util
import json
import math
import os
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('resource',type=Path);p.add_argument('bank');p.add_argument('identity');p.add_argument('preset',type=Path);p.add_argument('output',type=Path)
    p.add_argument('--note',type=float,required=True);p.add_argument('--initial-position',action='store_true',required=True);args=p.parse_args()
    if not math.isfinite(args.note):p.error('Finite explicit note required')
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):p.error('Commercial inputs must remain outside repository')
    if args.output.exists():p.error('Fresh private output required')
    spec=importlib.util.spec_from_file_location('damping_factory_archive',Path(__file__).with_name('pianoteq_factory_banks.py'));factory=importlib.util.module_from_spec(spec);spec.loader.exec_module(factory)
    inventory=factory.resource.inspect(args.resource);members=[m for m in inventory['members'] if m['name']==args.bank]
    if len(members)!=1:raise ValueError('Unique bank required')
    member=members[0];raw=args.resource.read_bytes();payload=bytes(x^0x55 for x in raw[member['offset']:member['offset']+member['bytes']]);bank=factory.inspect_bank(payload,args.bank,include_values=True)
    models=[m for m in bank['models'] if m.get('decoded_values',{}).get('strings',[None])[0]==args.identity]
    if len(models)!=1 or not models[0].get('fully_decoded'):raise ValueError('Unique complete model required')
    b=models[0]['decoded_values'];a=factory.fxp.inspect(args.preset,True)
    if b['version']!=89 or a['model']['identity'][0]!=args.identity:raise ValueError('Supported matching model/preset required')
    mar=next(r['value'] for r in b['fields'] if r['object_offset']==0x2f10)
    curves=[r for r in mar['fields'] if r['object_offset'] in [0x1e0,0x230,0x280,0x2d0,0x320,0xcc8]]
    preset=[r for r in a['decoded_tail']['fields'] if r['object_offset'] in [0x1110,0x1118]]
    if len(curves)!=6 or len(preset)!=2:raise ValueError('Complete damping curves and position fields required')
    result={'schema':'pianoteq-archive-damping-inputs-v1','note':args.note,'modelIdentity':args.identity,
        'baseFields':[{'object_offset':0x2f10,'value':{'fields':curves}}],'presetFields':preset,
        'positionRuntime':'initialized-primary-no-overrides','presetPath':str(args.preset.resolve()),'presetSha256':a['sha256'],
        'sources':{'resourceSha256':inventory['sha256'],'bank':args.bank,'bankMd5':member['md5']},'commercialInputsPrivate':True}
    with open(args.output,'x',opener=lambda q,f:os.open(q,f,0o600)) as out:json.dump(result,out,indent=2);out.write('\n')
    print(json.dumps({'identity':args.identity,'note':args.note,'presetSha256':a['sha256'],'curves':len(curves),'presetFields':len(preset)}))


if __name__=='__main__':main()
