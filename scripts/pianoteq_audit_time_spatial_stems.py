"""Independently read expanded spatial group/auxiliary WAVs against native data."""
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
    assert data['complete'] and not data['errors'] and data['timeSpatialComponent']
    assert manifest['endpoint'] == 'expanded' and manifest['computedSamples']
    assert manifest['timeToSpatialSameRun'] and manifest['spatialRingsInitializedToZero']
    assert manifest['normalization'] is False and manifest['finalStereo'] is False
    keys = {(epoch, kind, group, row) for epoch in range(5)
            for kind in ('group', 'auxiliary')
            for group in range(3 if kind == 'group' else 1) for row in range(3)}
    seen = set()
    totals = dict(group=0, auxiliary=0)
    for entry in manifest['files']:
        key = entry['epoch'], entry['kind'], entry['group'], entry['row']
        assert key in keys and key not in seen
        seen.add(key)
        epoch, kind, group, row = key
        records = [r for r in data['records'] if r['stage'] == 'expanded' and r['epoch'] == epoch]
        assert len(records) == data['windowBlocks'] and entry['firstCounter'] == 0
        assert all(r['counter'] == 64*i for i, r in enumerate(records))
        values = []
        for r in records:
            matrix = r['groups'][group] if kind == 'group' else r['auxiliary']
            assert matrix['rows'] == 3 and matrix['samples'] == 64
            values.extend(matrix['values'][row])
        expected = struct.pack('<' + 'f'*len(values), *values)
        sample_rate, actual = read_float_wav(args.directory / entry['name'])
        assert sample_rate == manifest['sampleRate']
        assert actual == expected and len(actual) == entry['frames']*4
        assert hashlib.sha256(actual).hexdigest() == entry['pcmSha256']
        totals[kind] += len(values)
    assert seen == keys
    result = dict(passed=True, nativeStage='expanded', files=len(seen),
                  comparedFloat32Samples=sum(totals.values()), matrixSamples=totals,
                  allVoicesStartAtZero=True, timeToSpatialSameRun=True,
                  spatialSourceCoefficientsObserved=True, observedAudioInput=True,
                  finalStereo=False)
    with args.report.open('x') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
