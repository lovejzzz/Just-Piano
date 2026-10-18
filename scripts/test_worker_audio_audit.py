"""Integrity controls for raw native audio evidence; synthetic data is not sound validation."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('pianoteq_audit_worker_audio_baseline.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class StageIntegrity(unittest.TestCase):
    def fixture(self, directory):
        block = struct.pack('<192f', *range(192))
        raw = block * 10
        data = {'workerAudioFile': 'worker-audio.bin', 'workerAudioSite': '0x100472fd0',
                'workerAudioErrors': [], 'workerAudioBytes': len(raw),
                'workerAudioSha256': hashlib.sha256(raw).hexdigest(), 'workerAudioRecords': []}
        for epoch in range(5):
            for counter in (64, 128):
                ordinal = len(data['workerAudioRecords'])
                data['workerAudioRecords'].append({'ordinal': ordinal, 'epoch': epoch,
                    'workerEndCounter': counter, 'offset': ordinal * len(block), 'bytes': len(block),
                    'layouts': [[1, 3, 64, 64]] * 3, 'sha256': hashlib.sha256(block).hexdigest()})
        (directory / 'worker-audio.bin').write_bytes(raw)
        return data, raw

    def test_stage_and_corruption_controls(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            original, raw = self.fixture(directory)
            blocks, inventory = audit.stage(original, directory, 'worker')
            self.assertEqual((len(blocks), inventory['samples']), (10, 1920))
            for mode in ('empty', 'missing-record', 'counter-gap', 'wrong-offset', 'wrong-layout', 'truncated', 'tampered'):
                with self.subTest(mode=mode):
                    data = copy.deepcopy(original)
                    altered = raw
                    if mode == 'empty': data['workerAudioRecords'] = []
                    if mode == 'missing-record': data['workerAudioRecords'].pop(3)
                    if mode == 'counter-gap': data['workerAudioRecords'][1]['workerEndCounter'] += 64
                    if mode == 'wrong-offset': data['workerAudioRecords'][1]['offset'] += 4
                    if mode == 'wrong-layout': data['workerAudioRecords'][1]['layouts'][0][3] = 1
                    if mode == 'truncated': altered = raw[:-4]
                    if mode == 'tampered': altered = bytes([raw[0] ^ 1]) + raw[1:]
                    (directory / 'worker-audio.bin').write_bytes(altered)
                    with self.assertRaises(ValueError): audit.stage(data, directory, 'worker')

    def test_extra_zero_block_is_not_equal(self):
        zero = bytes(768)
        left = {(0, 64): zero}
        right = {**left, (0, 128): zero}
        result = audit.compare_stage(left, right, 'worker', [4800])
        self.assertFalse(result['completeByteSequenceEqual'])
        self.assertEqual(result['unmatchedBlocks'], [(0, 128)])
        self.assertEqual(result['unmatchedNumericallyZeroBlocks'], 1)


if __name__ == '__main__':
    unittest.main()
