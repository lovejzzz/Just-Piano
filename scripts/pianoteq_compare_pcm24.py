"""Strict complete-WAV audit; no alignment, trimming, gain fit or tolerance."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import wave


def read(path):
    with wave.open(str(path), 'rb') as wav:
        fmt = dict(channels=wav.getnchannels(), sampleBytes=wav.getsampwidth(),
                   sampleRate=wav.getframerate(), frames=wav.getnframes(),
                   compression=wav.getcomptype())
        if fmt['sampleBytes'] != 3 or fmt['compression'] != 'NONE':
            raise ValueError('Uncompressed 24-bit integer PCM required')
        data = wav.readframes(fmt['frames'])
        if len(data) != fmt['frames'] * fmt['channels'] * 3:
            raise ValueError('Truncated WAV data')
    return fmt, data


def compare(actual, reference):
    af, a = read(actual)
    rf, b = read(reference)
    same_format = af == rf
    result = dict(passed=same_format and a == b, actualFormat=af,
                  referenceFormat=rf, actualPcmSha256=hashlib.sha256(a).hexdigest(),
                  referencePcmSha256=hashlib.sha256(b).hexdigest(),
                  actualSamples=len(a)//3, referenceSamples=len(b)//3,
                  sampleComparisonAvailable=same_format)
    if same_format:
        count = 0
        maximum = 0
        square_sum = 0
        first = None
        for i in range(0, len(a), 3):
            delta = int.from_bytes(a[i:i+3], 'little', signed=True) - int.from_bytes(b[i:i+3], 'little', signed=True)
            if delta:
                count += 1
                if first is None:
                    first = i//3
                maximum = max(maximum, abs(delta))
                square_sum += delta*delta
        result.update(differingInterleavedSamples=count, maxIntegerDifference=maximum,
                      firstDifferentInterleavedSample=first,
                      firstDifferentFrame=None if first is None else first//af['channels'],
                      normalizedRmsDifference=math.sqrt(square_sum/(len(a)//3))/(1 << 23) if a else 0)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('actual', type=Path)
    parser.add_argument('reference', type=Path)
    parser.add_argument('report', type=Path)
    args = parser.parse_args()
    result = compare(args.actual, args.reference)
    with args.report.open('x') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    print(json.dumps(result))
    raise SystemExit(0 if result['passed'] else 1)
