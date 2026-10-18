#!/usr/bin/env python3
"""Export one current decoded model/preset with explicit excitation context, privately."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('resource', 'bank', 'identity', 'preset', 'context', 'midi', 'output'):
        p.add_argument(name, type=str if name in ('bank', 'identity') else Path)
    args = p.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        p.error('Commercial inputs must remain outside repository')
    if args.output.exists():
        p.error('Fresh output required')
    context_bytes = args.context.read_bytes()
    if json.loads(context_bytes).get('schema') != 'pianoteq-excitation-runtime-context-v1':
        raise ValueError('Explicit excitation runtime context required')
    spec = importlib.util.spec_from_file_location('excitation_factory', Path(__file__).with_name('pianoteq_factory_banks.py'))
    factory = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(factory)
    inventory = factory.resource.inspect(args.resource)
    members = [m for m in inventory['members'] if m['name'] == args.bank]
    if len(members) != 1:
        raise ValueError('Unique bank required')
    member = members[0]
    raw = args.resource.read_bytes()
    bank = factory.inspect_bank(bytes(x ^ 0x55 for x in raw[member['offset']:member['offset'] + member['bytes']]), args.bank, include_values=True)
    models = [m for m in bank['models'] if m.get('decoded_values', {}).get('strings', [None])[0] == args.identity]
    if len(models) != 1 or not models[0].get('fully_decoded'):
        raise ValueError('Unique fully decoded model required')
    model = models[0]['decoded_values']
    preset = factory.fxp.inspect(args.preset, True)
    if model['version'] != 89 or preset['model']['identity'][0] != args.identity:
        raise ValueError('Supported matching model and preset required')
    result = dict(schema='pianoteq-excitation-archive-inputs-v1', modelIdentity=args.identity,
                  resourcePath=str(args.resource.resolve()), resourceSha256=inventory['sha256'], bank=args.bank, bankMd5=member['md5'],
                  presetPath=str(args.preset.resolve()), presetSha256=preset['sha256'], baseFields=model['fields'], presetFields=preset['decoded_tail']['fields'],
                  contextPath=str(args.context.resolve()), contextSha256=hashlib.sha256(context_bytes).hexdigest(),
                  midiPath=str(args.midi.resolve()), midiSha256=hashlib.sha256(args.midi.read_bytes()).hexdigest(), commercialInputsPrivate=True)
    with open(args.output, 'x', opener=lambda q, f: os.open(q, f, 0o600)) as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps({k: result[k] for k in ('schema', 'presetSha256', 'resourceSha256')}))


if __name__ == '__main__':
    main()
