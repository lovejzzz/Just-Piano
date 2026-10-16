"""Require numeric replay, complete capture, native exit and authentic PCM.

Each --case supplies a capture directory and its original reference WAV.
Partial arithmetic agreement or LLDB's exit code cannot satisfy this audit.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile
import wave
from pianoteq_audit_release_runs import pcm, compare_audio


def audit(directory, reference, replay_script=None, replay_options=()):
    replay_script = replay_script or Path(__file__).with_name('pianoteq_replay_release_queue.mjs')
    with tempfile.TemporaryDirectory(prefix='release-audit-') as temporary:
        report_path = Path(temporary) / 'report.json'
        run = subprocess.run(['node', str(replay_script), str(directory / 'runtime.json'),
                              str(report_path), *replay_options], capture_output=True, text=True)
        replay = json.loads(report_path.read_text()) if report_path.exists() else None
    if replay is not None:
        (directory / 'audited-replay.json').write_text(json.dumps(replay, indent=2) + '\n')
    native_exit = bool(re.search(r'Process \d+ exited with status = 0',
                                 (directory / 'capture.log').read_text()))
    try:
        audio = compare_audio(pcm(reference), pcm(directory / 'observed.wav'))
    except (wave.Error, EOFError, FileNotFoundError) as error:
        audio = {'pcmEqual': False, 'error': str(error)}
    return {'directory': str(directory), 'reference': str(reference),
            'passed': run.returncode == 0 and bool(replay and replay['passed'])
                      and native_exit and audio['pcmEqual'],
            'replayExitCode': run.returncode,
            'numericCount': replay.get('count', replay.get('comparedFloatValues', 0)) if replay else 0,
            'numericMatched': replay.get('matched', replay.get('comparedFloatValues', 0) -
                                         replay.get('mismatches', 0)) if replay else 0,
            'windowComplete': replay['windowComplete'] if replay else False,
            'nativeExitZero': native_exit, 'audio': audio,
            'replayError': run.stderr if replay is None else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', nargs=2, type=Path, action='append', required=True,
                        metavar=('CAPTURE_DIRECTORY', 'REFERENCE_WAV'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--replay-script', type=Path,
                        help='Alternate local release-window replay implementation')
    parser.add_argument('--release-report', type=Path,
                        help='Calculated control timeline for worker-only render capture')
    args = parser.parse_args()
    replay_options = ['--release-report', str(args.release_report)] if args.release_report else []
    cases = [audit(directory, reference, args.replay_script, replay_options)
             for directory, reference in args.case]
    result = {'passed': all(c['passed'] for c in cases), 'cases': cases,
              'completeVoiceOrBrowserEquivalence': False}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'cases': len(cases),
                      'passedCases': sum(c['passed'] for c in cases),
                      'numericCount': sum(c['numericCount'] for c in cases),
                      'numericMatched': sum(c['numericMatched'] for c in cases)}))
    raise SystemExit(0 if result['passed'] else 1)


if __name__ == '__main__':
    main()
