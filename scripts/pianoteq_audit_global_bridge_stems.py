"""Independently read computed cabinet source, auxiliary and destination WAVs."""
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
    args = parser.parse_args()
    data = json.loads(args.capture.read_text())
    manifest = json.loads((args.directory / 'manifest.json').read_text())
    assert data['complete'] and not data['errors'] and data['timeSpatialRoutingGlobalComponent']
    assert data['globalPending'] is None
    assert manifest['endpoint'] == 'cabinet' and manifest['computedSamples']
    assert manifest['sharedRowsToCabinetSameRun'] and manifest['boundedGlobalPrefix']
    assert manifest['normalization'] is False and manifest['finalStereo'] is False
    targets = [r for r in data['records'] if r['stage'] == 'cabinet']
    assert len(targets) == data['globalFrames']
    assert all(r['globalBlock'] == i and r['counter'] == i*64 for i, r in enumerate(targets))
    kinds = dict(source=9, auxiliary=3, before=3)
    keys = {(kind, row) for kind, rows in kinds.items() for row in range(rows)}
    seen = set()
    totals = dict.fromkeys(kinds, 0)
    for entry in manifest['files']:
        key = entry['kind'], entry['row']
        assert key in keys and key not in seen and entry['firstGlobalBlock'] == 0
        seen.add(key)
        kind, row = key
        expected = bytearray()
        for r in targets:
            assert r[kind]['rows'] == kinds[kind] and r[kind]['samples'] == 64
            expected.extend(struct.pack('<64f', *r[kind]['values'][row]))
        rate, actual = read_float_wav(args.directory / entry['name'])
        assert rate == manifest['sampleRate'] and len(actual) == entry['frames']*4
        assert actual == expected and hashlib.sha256(actual).hexdigest() == entry['pcmSha256']
        totals[kind] += len(actual)//4
    assert seen == keys
    result = dict(passed=True, nativeStage='cabinet', files=len(seen),
                  comparedFloat32Samples=sum(totals.values()), categories=totals,
                  globalBlocks=data['globalFrames'], sharedRowsToCabinetSameRun=True,
                  globalRouteInputObserved=True, globalFeedbackObserved=True,
                  boundedGlobalPrefix=True, finalStereo=False)
    with args.report.open('x') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
