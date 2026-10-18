#!/usr/bin/env python3
"""Decode one factory preset and its base soundboard directly to a private input."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import pianoteq_factory_banks as factory
from pianoteq_export_soundboard_microphone_inputs import EXPECTED, read_static_microphone_registry

RESOURCE_SHA256 = 'd8383d3910cb17cda98075acccfeb9e3829b0ad34a6af1fc1cde67484c805d3d'


def export_factory_soundboard(resource, bank_name, preset_name, binary, render_rate, base_rate=44100):
    if not math.isfinite(render_rate) or render_rate <= 0 or not 0 < base_rate <= 0xffffffff:
        raise ValueError('Finite positive explicit render configuration required')
    inventory = factory.resource.inspect(resource)
    if inventory['sha256'] != RESOURCE_SHA256:
        raise ValueError('Pinned resource version required')
    members = [m for m in inventory['members'] if m['name'] == bank_name]
    if len(members) != 1:
        raise ValueError('Unique factory bank required')
    member = members[0]
    raw = resource.read_bytes()
    decoded = bytes(x ^ 0x55 for x in raw[member['offset']:member['offset'] + member['bytes']])
    bank = factory.inspect_bank(decoded, bank_name, include_values=True)
    presets = [p for p in bank['presets'] if p['name'] == preset_name]
    if len(presets) != 1:
        raise ValueError('Unique factory preset required')
    preset = presets[0]
    if preset['type'] != 0 or preset['state_version'] not in (78, 79) or preset['unparsed_state_bytes'] or \
            preset['layer_count'] or preset['nested_A_count']:
        raise ValueError('Completely decoded single-model factory state required')
    models = [m for m in bank['models'] if m.get('decoded_values', {}).get('strings', [None])[0] == preset['model_identity']]
    if len(models) != 1 or not models[0]['fully_decoded']:
        raise ValueError('Unique completely decoded base model required')
    model = models[0]
    base = model['decoded_values']
    fields = {f['object_offset']: f for f in base['fields']}
    if base['version'] != 89 or fields[0x3d68]['kind'] != 'filters' or fields[0x3f90]['kind'] != 'u':
        raise ValueError('Supported base soundboard schema required')
    preset_fields = preset['detailed_state']['fields']
    selected = [f for f in preset_fields if f['object_offset'] in (0xf98, 0x1018, 0x1020, 0x1024)]
    outputs = [f['value'] for f in preset_fields if f['object_offset'] == 0x1760]
    if len(selected) != 4 or len(outputs) != 1 or outputs[0]['kind'] != 3:
        raise ValueError('Complete ordinary factory output state required')
    # The source state hash includes the original version and complete A body,
    # rather than a reserialized subset of the selected numerical fields.
    state = decoded[preset['state_start']:preset['end_offset']]
    return {'schema': 1, 'identity': preset['model_identity'], 'baseVersion': base['version'],
        'soundboards': fields[0x3d68]['value'],
        'modelFeatures': {'leadingSilencePresetOverride': fields[0x3f90]['value']},
        'presetFields': selected,
        'sources': {'resourceSha256': RESOURCE_SHA256, 'bank': bank_name, 'bankMd5': member['md5'],
            'verifiedMemberCount': inventory['verified_member_md5_count'],
            'modelArchiveOffset': model['offset'], 'modelArchiveBytes': model['bytes'],
            'factoryPreset': {'name': preset_name, 'stateVersion': preset['state_version'],
                'stateOffset': preset['state_start'], 'stateBytes': len(state),
                'stateSha256': hashlib.sha256(state).hexdigest()}},
        'microphones': {'schema': 1, 'output': outputs[0], 'registry': read_static_microphone_registry(binary),
            'soloMicrophone': 0, 'soloMicrophoneSource': 'no-prefs-default',
            'binarySha256': EXPECTED, 'nativeRuntimeTablesUsedForExport': False},
        'runtimeRates': {'baseRate': base_rate, 'renderRate': render_rate, 'source': 'explicit-render-configuration'},
        'commercialInputsPrivate': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('resource', type=Path)
    parser.add_argument('bank')
    parser.add_argument('preset')
    parser.add_argument('binary', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--render-rate', type=float, required=True)
    parser.add_argument('--base-rate', type=int, default=44100)
    args = parser.parse_args()
    if args.output.resolve().is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error('Commercial inputs must remain outside the repository')
    if args.output.exists():
        parser.error('Fresh private output required')
    result = export_factory_soundboard(args.resource, args.bank, args.preset, args.binary, args.render_rate, args.base_rate)
    with open(args.output, 'x', opener=lambda p, f: os.open(p, f, 0o600)) as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'identity': result['identity'], 'preset': result['sources']['factoryPreset'],
        'components': len(result['soundboards']['filters']),
        'outputSha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
