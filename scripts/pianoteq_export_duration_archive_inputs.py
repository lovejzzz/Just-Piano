#!/usr/bin/env python3
"""Export decoded duration inputs from a current resource and matching FXP, privately."""
import argparse
import importlib.util
import json
import os
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('resource', 'bank', 'identity', 'preset', 'output'):
        p.add_argument(name, type=Path if name in ('resource', 'preset', 'output') else str)
    args = p.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        p.error('Commercial inputs must remain outside the repository')
    if args.output.exists():
        p.error('Fresh private output required')
    spec = importlib.util.spec_from_file_location('duration_factory_archive', Path(__file__).with_name('pianoteq_factory_banks.py'))
    factory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(factory)
    inventory = factory.resource.inspect(args.resource)
    members = [m for m in inventory['members'] if m['name'] == args.bank]
    if len(members) != 1:
        raise ValueError('Unique bank required')
    member = members[0]
    raw = args.resource.read_bytes()
    payload = bytes(x ^ 0x55 for x in raw[member['offset']:member['offset'] + member['bytes']])
    bank = factory.inspect_bank(payload, args.bank, include_values=True)
    models = [m for m in bank['models'] if m.get('decoded_values', {}).get('strings', [None])[0] == args.identity]
    if len(models) != 1 or not models[0].get('fully_decoded'):
        raise ValueError('Unique complete model required')
    model = models[0]['decoded_values']
    preset = factory.fxp.inspect(args.preset, True)
    if model['version'] != 89 or preset['model']['identity'][0] != args.identity:
        raise ValueError('Matching supported model and preset required')
    edits = [r for r in preset['decoded_tail']['fields'] if r['object_offset'] in (0x10a8, 0x1334, 0x1338, 0x1398, 0x139c, 0x45c)]
    base = [r for r in model['fields'] if r['object_offset'] == 0x1c10]
    if len(edits) != 6 or len(base) != 1:
        raise ValueError('Complete duration fields required')
    result = dict(schema='pianoteq-duration-archive-inputs-v1', modelIdentity=args.identity,
                  presetPath=str(args.preset.resolve()), presetSha256=preset['sha256'],
                  resourcePath=str(args.resource.resolve()), resourceSha256=inventory['sha256'],
                  bank=args.bank, bankMd5=member['md5'], editFields=edits, baseFields=base,
                  runtimeMode='linear-clamp', runtimeCurveModeStillAssumed=True,
                  commercialInputsPrivate=True)
    with open(args.output, 'x', opener=lambda q, f: os.open(q, f, 0o600)) as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps({k: result[k] for k in ('schema', 'presetSha256', 'resourceSha256')}))


if __name__ == '__main__':
    main()
