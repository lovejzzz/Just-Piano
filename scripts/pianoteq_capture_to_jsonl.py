"""Lossless analysis view: all capture fields and records, plus byte provenance."""
import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('capture', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    assert args.output.suffix == '.jsonl' and not args.output.exists() and not args.manifest.exists()
    source_hash = sha256(args.capture)
    with args.capture.open() as f:
        data = json.load(f)
    records = data.pop('records')
    assert isinstance(records, list)
    dump = lambda value: json.dumps(value, separators=(',', ':'), allow_nan=False)
    with args.output.open('x') as out:
        out.write(dump(dict(format='pianoteq-capture-jsonl-v1', recordCount=len(records), metadata=data))+'\n')
        for record in records:
            out.write(dump(record)+'\n')
    assert source_hash == sha256(args.capture), 'Capture changed during conversion'
    result = dict(sourcePath=str(args.capture.resolve()), sourceSha256=source_hash,
                  outputPath=str(args.output.resolve()), outputSha256=sha256(args.output),
                  records=len(records), allFieldsPreserved=True, noNumericNormalization=True)
    with args.manifest.open('x') as out:
        json.dump(result, out, indent=2)
        out.write('\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
