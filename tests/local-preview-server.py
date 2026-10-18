import hashlib
import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer
from pathlib import Path

spec = importlib.util.spec_from_file_location('preview', Path(__file__).resolve().parents[1] / 'scripts/serve_local_preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class LocalPreviewTests(unittest.TestCase):
    def test_bound_pcm_range_and_private_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory) / 'private.wav'
            audit = Path(directory) / 'audit.json'
            pcm = bytes(range(96))
            with wave.open(str(wav), 'wb') as stream:
                stream.setparams((2, 3, 48000, 0, 'NONE', 'not compressed'))
                stream.writeframes(pcm)
            data = {'differentPCMBytes': 0, 'pcmFrames': 16, 'pcmBytes': 96,
                    'pcmSha256': hashlib.sha256(pcm).hexdigest()}
            audit.write_text(json.dumps(data))
            metadata = preview.verified_metadata(wav, audit, 'test')
            model = {'baseFields': [], 'presetFields': [], 'contextPath': '/private/not-served', 'nativeState': [123]}
            for name in ['resource', 'preset']:
                model[name + 'Path'] = str(wav)
                model[name + 'Sha256'] = hashlib.sha256(wav.read_bytes()).hexdigest()
            archive = Path(directory) / 'model.json'
            archive.write_text(json.dumps(model))
            safe_model = preview.live_model_bytes(archive)
            self.assertEqual(json.loads(safe_model), {'baseFields': [], 'presetFields': []})
            server = ThreadingHTTPServer(('127.0.0.1', 0), preview.handler_for(wav, metadata, safe_model))
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            base = f'http://127.0.0.1:{server.server_port}'
            try:
                with urllib.request.urlopen(base + '/__local/live-model.json') as response:
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                    self.assertEqual(response.read(), safe_model)
                with urllib.request.urlopen(base + '/__local/verified-preview.json') as response:
                    self.assertTrue(json.load(response)['liveModelAvailable'])
                request = urllib.request.Request(base + '/__local/verified-preview.wav', headers={'Range': 'bytes=12-31'})
                with urllib.request.urlopen(request) as response:
                    self.assertEqual(response.status, 206)
                    self.assertEqual(response.read(), wav.read_bytes()[12:32])
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                for route in ['/__local/private.wav', '/.git/config', '/docs/ny-closed-loop-acceptance.json', '/dsp/%2e%2e/.git/config']:
                    with self.assertRaises(urllib.error.HTTPError) as result:
                        urllib.request.urlopen(base + route)
                    self.assertEqual(result.exception.code, 404)
                    result.exception.close()
            finally:
                server.shutdown()
                server.server_close()
                worker.join()
            data['pcmSha256'] = 'wrong'
            audit.write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                preview.verified_metadata(wav, audit, 'test')


if __name__ == '__main__':
    unittest.main()
