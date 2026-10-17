"""Independently read exported float WAVs and compare native observed samples."""
import argparse, hashlib, json, struct
from pathlib import Path


def read_float_wav(path):
    raw = path.read_bytes()
    assert raw[:4] == b'RIFF' and raw[8:12] == b'WAVE'
    assert struct.unpack_from('<I', raw, 4)[0] + 8 == len(raw)
    chunks = {}
    position = 12
    while position < len(raw):
        name, size = struct.unpack_from('<4sI', raw, position)
        assert name not in chunks and position + 8 + size <= len(raw)
        chunks[name] = raw[position + 8:position + 8 + size]
        position += 8 + size + (size & 1)
    assert position == len(raw)
    fmt = struct.unpack_from('<HHIIHH', chunks[b'fmt '])
    assert fmt[0] == 3 and fmt[1] == 1 and fmt[3] == fmt[2] * 4
    assert fmt[4:] == (4, 32)
    payload = chunks[b'data']
    assert len(payload) % 4 == 0
    assert struct.unpack('<I', chunks[b'fact'])[0] == len(payload) // 4
    return fmt[2], payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('directory', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--stage', choices=('consumerPost', 'audioReturn'))
    args = parser.parse_args()
    data = json.loads(args.capture.read_text())
    assert data['complete'] and not data['errors'] and data['consumerPost']
    manifest = json.loads((args.directory / 'manifest.json').read_text())
    endpoint = manifest.get('endpoint', 'consumerPost')
    assert endpoint in ('consumerPost', 'audioReturn') and (args.stage is None or args.stage == endpoint)
    if endpoint == 'audioReturn':
        assert data.get('voiceRattleAudio') and manifest['rattlePrimaryInputObserved'] is False
    assert manifest['computedSamples'] and not manifest['normalization']
    assert len(manifest['files']) == 15
    seen, total = set(), 0
    for entry in manifest['files']:
        epoch, group = entry['epoch'], entry['group']
        assert (epoch, group) not in seen and 0 <= epoch < 5 and 0 <= group < 3
        seen.add((epoch, group))
        targets = [r for r in data['records'] if r['stage'] == endpoint and r['epoch'] == epoch]
        assert targets and targets[0]['counter'] == entry['firstComparedCounter']
        assert all(r['counter'] == targets[0]['counter'] + 64 * i for i, r in enumerate(targets))
        if manifest.get('allVoiceStartsAtZero'):
            assert targets[0]['counter'] == 0
        expected = bytearray()
        for row in targets:
            assert len(row['channels'][group]) == 64
            expected.extend(struct.pack('<64f', *row['channels'][group]))
        rate, payload = read_float_wav(args.directory / entry['name'])
        assert rate == manifest['sampleRate'] and len(payload) // 4 == entry['frames']
        assert payload == expected, ('Native PCM differs', epoch, group)
        assert hashlib.sha256(payload).hexdigest() == entry['pcmSha256']
        total += len(payload) // 4
    result = dict(passed=True, nativeStage=endpoint, files=len(seen), comparedFloat32Samples=total,
                  allVoiceStartsAtZero=manifest.get('allVoiceStartsAtZero', False),
                  groupEnvelopeSeedObserved=manifest.get('groupEnvelopeSeedObserved'),
                  finalStereo=False, observedModelAndControlInputsRemain=True)
    args.report.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
