"""Read all post-envelope group AND auxiliary WAVs against actual native samples."""
import argparse
import hashlib
import json
import struct
from pathlib import Path
from pianoteq_audit_post_consumer_stems import read_float_wav


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('directory', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--stage', choices=('audioTail', 'time'), default='audioTail')
    args = parser.parse_args()
    data = json.loads(args.capture.read_text())
    manifest = json.loads((args.directory / 'manifest.json').read_text())
    assert data['complete'] and not data['errors']
    assert data.get('activeTimeComponent') if args.stage == 'time' else data.get('voiceTailEnvelopes')
    assert manifest['endpoint'] == args.stage and manifest['computedSamples']
    assert not manifest['normalization'] and manifest['finalStereo'] is False
    assert manifest['matrixKinds'] == ['group', 'auxiliary']
    assert manifest['terminalInitialEnvelopeStateObserved'] is False
    assert manifest['allVoiceStartsAtZero'] and len(manifest['files']) == 30
    expected_keys = {(epoch, kind, row) for epoch in range(5)
                     for kind in ('group', 'auxiliary') for row in range(3)}
    seen, totals = set(), {'group': 0, 'auxiliary': 0}
    for entry in manifest['files']:
        epoch, kind, row = entry['epoch'], entry['kind'], entry['group']
        key = epoch, kind, row
        assert key in expected_keys and key not in seen
        seen.add(key)
        targets = [r for r in data['records'] if r['stage'] == args.stage and r['epoch'] == epoch]
        if args.stage == 'time':
            assert len(targets) == data['windowBlocks'] and manifest['boundedComponent'] and manifest['observedAudioInput']
        assert targets and targets[0]['counter'] == entry['firstComparedCounter'] == 0
        assert all(r['counter'] == 64*i for i, r in enumerate(targets))
        payload = bytearray()
        for target in targets:
            samples = target['channels'][row] if kind == 'group' else target['auxiliary']['values'][row]
            assert len(samples) == 64
            payload.extend(struct.pack('<64f', *samples))
        sample_rate, actual = read_float_wav(args.directory / entry['name'])
        assert sample_rate == manifest['sampleRate']
        assert actual == payload and len(actual)//4 == entry['frames']
        assert hashlib.sha256(actual).hexdigest() == entry['pcmSha256']
        totals[kind] += len(actual)//4
    assert seen == expected_keys
    result = dict(passed=True, nativeStage=args.stage, files=len(seen),
                  comparedFloat32Samples=sum(totals.values()), matrixSamples=totals,
                  allVoiceStartsAtZero=True, finalStereo=False, boundedComponent=args.stage == 'time',
                  expDoubleCandidateUsed=manifest.get('expDoubleCandidateUsed', False),
                  auxiliaryEntryObserved=manifest['terminalAuxiliaryEntryObserved'],
                  initialTimeStateObserved=manifest['terminalInitialTimeStateObserved'],
                  observedModelAndControlInputsRemain=True)
    with args.report.open('x') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
