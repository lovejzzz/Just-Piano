"""Read shared routed WAV rows and verify all actual native contribution batches."""
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
    assert data['complete'] and not data['errors'] and data['timeSpatialRoutingComponent']
    assert not data['pending'] and not data['waiting'] and data['readContext'] is None
    assert manifest['endpoint'] == 'readReturn' and manifest['computedSamples']
    assert manifest['sharedContributionBatches'] and manifest['spatialToRoutingSameRun']
    assert manifest['normalization'] is False and manifest['finalStereo'] is False
    labels = ['aux', 'group0', 'group1', 'group2']
    seen = set()
    total = 0
    for entry in manifest['files']:
        key = entry['index'], entry['row']
        assert key not in seen and 0 <= key[0] < 4 and 0 <= key[1] < 3
        seen.add(key)
        index, row = key
        assert entry['label'] == labels[index] and entry['firstReadBlock'] == 0
        records = [r for r in data['records'] if r['stage'] == 'readReturn' and r['index'] == index]
        assert len(records) == data['readBlocks']
        assert all(r['readBlock'] == i and r['counter'] == i*64 for i, r in enumerate(records))
        expected = bytearray()
        for r in records:
            assert r['matrix']['rows'] == 3 and r['matrix']['samples'] == 64 and r['contributors']
            expected.extend(struct.pack('<64f', *r['matrix']['values'][row]))
        rate, actual = read_float_wav(args.directory / entry['name'])
        assert rate == manifest['sampleRate'] and len(actual) == entry['frames']*4
        assert actual == expected and hashlib.sha256(actual).hexdigest() == entry['pcmSha256']
        total += len(actual)//4
    assert seen == {(i, row) for i in range(4) for row in range(3)}
    result = dict(passed=True, nativeStage='readReturn', files=len(seen),
                  comparedFloat32Samples=total, sharedReadFrames=data['readBlocks'],
                  sharedContributionBatches=True, spatialToRoutingSameRun=True,
                  observedAudioInput=True, routingTablesObserved=True, finalStereo=False)
    with args.report.open('x') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
