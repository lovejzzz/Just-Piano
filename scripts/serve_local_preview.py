#!/usr/bin/env python3
"""Serve the public app plus one explicitly configured private verified WAV on loopback."""
import argparse
import hashlib
import json
import re
import subprocess
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ASSETS = {'index.html', 'style.css', 'app.js', 'presets.js', 'piano-worklet.js',
          'verified-preview.js', 'sw.js', 'icon.svg', 'manifest.webmanifest'}


def verified_metadata(wav_path, audit_path, revision):
    audit = json.loads(audit_path.read_text())
    with wave.open(str(wav_path), 'rb') as stream:
        frames, rate = stream.getnframes(), stream.getframerate()
        pcm = stream.readframes(frames)
        if stream.getnchannels() != 2 or stream.getsampwidth() != 3:
            raise ValueError('Verified stereo 24-bit WAV required')
    if (audit.get('differentPCMBytes') != 0 or audit.get('pcmFrames') != frames or
            audit.get('pcmBytes') != len(pcm) or
            audit.get('pcmSha256') != hashlib.sha256(pcm).hexdigest()):
        raise ValueError('WAV does not match the complete PCM verification audit')
    return {'available': True, 'frames': frames, 'sampleRate': rate,
            'renderRevision': revision, 'audioUrl': '/__local/verified-preview.wav'}


def handler_for(wav_path, metadata):
    wav_bytes = wav_path.read_bytes()
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            super().end_headers()

        def do_HEAD(self):
            self.serve(head=True)

        def do_GET(self):
            self.serve(head=False)

        def serve(self, head):
            target = unquote(urlsplit(self.path).path)
            if target == '/__local/verified-preview.json':
                revision = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT,
                                          capture_output=True, text=True, check=True).stdout.strip()
                data = json.dumps({**metadata, 'uiRevision': revision}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                if not head:
                    self.wfile.write(data)
                return
            if target == '/__local/verified-preview.wav':
                size = len(wav_bytes)
                start, end, status = 0, size - 1, 200
                requested = self.headers.get('Range')
                if requested:
                    match = re.fullmatch(r'bytes=(\d+)-(\d*)', requested)
                    if not match:
                        self.send_error(416)
                        return
                    start = int(match[1])
                    end = min(size - 1, int(match[2])) if match[2] else size - 1
                    if start > end:
                        self.send_error(416)
                        return
                    status = 206
                self.send_response(status)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Content-Length', str(end - start + 1))
                if status == 206:
                    self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.end_headers()
                if not head:
                    self.wfile.write(wav_bytes[start:end + 1])
                return
            relative = target.lstrip('/') or 'index.html'
            resolved = (ROOT / relative).resolve()
            normalized = resolved.relative_to(ROOT).as_posix() if resolved.is_relative_to(ROOT) else ''
            if (not resolved.is_relative_to(ROOT) or
                    normalized not in ASSETS and not normalized.startswith('dsp/') or
                    not resolved.is_file()):
                self.send_error(404)
                return
            if head:
                super().do_HEAD()
            else:
                super().do_GET()
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wav', type=Path, required=True)
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--render-revision', required=True)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    metadata = verified_metadata(args.wav, args.audit, args.render_revision)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(args.wav, metadata))
    print(f'Local verified audition: http://localhost:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
