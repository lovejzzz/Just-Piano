"""Compare complete native runs by voice identity, not chronological hashes.

This is an observational audit, never a proof that order explains final PCM.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import wave


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def load(root):
    raw = (root / 'runtime.json').read_bytes(); data = json.loads(raw)
    launch = json.loads((root / 'launch.json').read_bytes())
    status = data['runStatus']
    if not status['terminal'] or status['exitStatus'] != 0 or data['targetMutation'] is not False or any(
            data[name] for name in ('errors', 'keyAudioErrors', 'downstreamErrors', 'pendingGlobalContributors')):
        raise ValueError('Complete successful native run required')
    if data['downstreamPending'] is not None or len(data['keyAudioRecords']) != 3314 or len(data['globalAudioRecords']) != 2320:
        raise ValueError('Complete primary capture inventory required')
    for file, sha in launch['helperSha256'].items():
        if digest((root.parent / file).read_bytes()) != sha: raise ValueError('Frozen collector changed')
    fixture = launch['fixture']
    for file, sha in [(fixture['midiPath'], fixture['midiSha256']), (fixture['resourcePath'], fixture['resourceSha256']),
                      (fixture['selection']['path'], fixture['selection']['sha256'])]:
        if digest(Path(file).read_bytes()) != sha: raise ValueError('Fixture changed')
    expected = [fixture['binaryPath'], '--headless', '--no-prefs', '--multicore', '0', '--fxp', fixture['selection']['path'],
                '--midi', fixture['midiPath'], '--wav', str(root / 'observed.wav'), '--rate', '48000', '--bit-depth', '24', '--dither', 'OFF']
    if launch['arguments'] != expected: raise ValueError('Explicit identical normal render configuration required')
    audio = (root / data['keyAudioFile']).read_bytes()
    if len(audio) != 3314 * 3072 or len(audio) != data['keyAudioBytes'] or digest(audio) != data['keyAudioSha256']: raise ValueError('Complete key stream required')
    keys = {}; order = []; ages = {}
    for ordinal, item in enumerate(data['keyAudioRecords']):
        key = (item['epoch'], item['voiceBlockCounter']); start = ordinal * 3072
        if key in keys or item['ordinal'] != ordinal or item['offset'] != start or item['bytes'] != 3072:
            raise ValueError('Unique full chronological key coverage required')
        if item['voiceBlockCounter'] != ages.get(item['epoch'], -64) + 64 or item['nativeAge'] != item['voiceBlockCounter'] + 64:
            raise ValueError('Contiguous native voice ages required')
        ages[item['epoch']] = item['voiceBlockCounter']
        block = audio[start:start + 3072]
        if digest(block) != item['sha256']: raise ValueError('Key block changed')
        keys[key] = (item, block); order.append(key)
    if set(ages) != set(range(5)): raise ValueError('All five native voices required')
    mono_bytes = (root / data['monoBodyFile']).read_bytes()
    if digest(mono_bytes) != data['monoBodySha256']: raise ValueError('Bound same-run mono required')
    mono = json.loads(mono_bytes)
    if mono['runStatus']['pid'] != status['pid'] or mono['errors'] or mono['pending'] or len(mono['observations']) != 2320:
        raise ValueError('Complete same-run mono inventory required')
    wav = (root / 'observed.wav').read_bytes()
    if wav[:4] != b'RIFF' or int.from_bytes(wav[4:8], 'little') + 8 != len(wav): raise ValueError('Complete RIFF required')
    with wave.open(str(root / 'observed.wav'), 'rb') as w:
        if (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) != (2, 3, 48000, 148224):
            raise ValueError('Complete primary PCM extent required')
        pcm = w.readframes(w.getnframes())
        if len(pcm) != 148224 * 6: raise ValueError('Truncated PCM')
    return data, launch, keys, order, mono, pcm, digest(raw)


def words(value):
    if isinstance(value, list): return b''.join(words(x) for x in value)
    if not math.isfinite(value): raise ValueError('Finite source audio required')
    return struct.pack('<f', value)


def main():
    first, second, destination = map(Path, sys.argv[1:])
    if destination.exists(): raise ValueError('Fresh private report required')
    a, b = load(first), load(second)
    if a[1]['fixture'] != b[1]['fixture'] or a[2].keys() != b[2].keys(): raise ValueError('Identical fixture and keyed voice inventory required')
    changed_audio = 0; changed_metadata = {}; changed_words = 0
    for key in a[2]:
        left, right = a[2][key], b[2][key]
        if left[1] != right[1]:
            changed_audio += 1
            changed_words += sum(x != y for x, y in zip(struct.unpack('<768I', left[1]), struct.unpack('<768I', right[1])))
        for name in ('mappings', 'groupGains', 'selectionMask', 'layouts', 'globalOrdinal'):
            if left[0][name] != right[0][name]: changed_metadata[name] = changed_metadata.get(name, 0) + 1
    order_blocks = []
    for index, (left, right) in enumerate(zip(a[0]['globalAudioRecords'], b[0]['globalAudioRecords'])):
        x, y = [[(r['epoch'], r['counter']) for r in item['contributors']] for item in (left, right)]
        if sorted(x) != sorted(y): raise ValueError('Contribution inventory differs; order-only comparison invalid')
        if x != y: order_blocks.append(index)
    sources = {}
    for field in ('bodyBefore', 'driveInputBefore', 'bodyInputs', 'driveScratch', 'monoTarget', 'directSource'):
        blocks = []; differences = 0
        for i, (x, y) in enumerate(zip(a[4]['observations'], b[4]['observations'])):
            u, v = words(x[field]), words(y[field])
            if len(u) != len(v): raise ValueError('Complete same-shape source rows required')
            if u != v:
                blocks.append(i); differences += sum(u[j:j+4] != v[j:j+4] for j in range(0, len(u), 4))
        sources[field] = {'differentBlocks': len(blocks), 'differentFloat32Words': differences, 'firstBlock': blocks[0] if blocks else None}
    pcm_differences = [i // 3 for i in range(0, len(a[5]), 3) if a[5][i:i+3] != b[5][i:i+3]]
    report = {'schema': 1, 'auditComplete': True, 'captureRuntimeSha256': [a[6], b[6]],
        'voiceBlocksCompared': len(a[2]), 'differentKeyedAudioBlocks': changed_audio, 'differentKeyedAudioWords': changed_words,
        'differentKeyMetadata': changed_metadata, 'chronologicalOrderDifferences': sum(x != y for x, y in zip(a[3], b[3])),
        'differentContributionOrderBlocks': len(order_blocks), 'firstOrderBlock': order_blocks[0] if order_blocks else None,
        'sources': sources, 'pcm': {'sha256': [digest(a[5]), digest(b[5])], 'differentSamples': len(pcm_differences),
            'firstFrame': pcm_differences[0] // 2 if pcm_differences else None},
        'alignmentApplied': False, 'normalizationApplied': False, 'croppingApplied': False,
        'causalExplanationProven': False, 'independentEngineStereoVerified': False}
    destination.write_text(json.dumps(report, indent=2)); print(json.dumps(report))


if __name__ == '__main__': main()
