"""Compare this replay's explicit history-math candidates with a system oracle.

The oracle is built from pianoteq_system_math_oracle.c. This verifies only the
observed arguments, never claims a recovered exp2f/log10f implementation.
"""
import argparse,json,math,struct,subprocess
from pathlib import Path

def verify(oracle,replay,output):
    data=json.loads(replay.read_text())
    if not data.get('passed') or not data.get('platformMathCandidatesExplicit') or not data.get('mathCalls'):
        raise ValueError('Passing replay with explicit candidate calls required')
    failures=[];counts={}
    for call in data['mathCalls']:
        function=call['function'];x=call['input'];y=call['output']
        if function not in ('exp2f','log10f') or not all(math.isfinite(v) for v in (x,y)):
            raise ValueError('Supported finite history math required')
        counts[function]=counts.get(function,0)+1
        result=subprocess.run([str(oracle),function,struct.pack('>d',x).hex()],capture_output=True,text=True,check=True)
        actual=struct.unpack('>d',bytes.fromhex(result.stdout.strip()))[0]
        if struct.pack('>f',actual)!=struct.pack('>f',y):failures.append({**call,'system':actual})
    report={'passed':not failures,'count':len(data['mathCalls']),'byFunction':counts,'mismatches':len(failures),
            'nativeImplementationRecovered':False,'onlyObservedCandidateArguments':True,'failures':failures}
    output.write_text(json.dumps(report,indent=2)+'\n');return report

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('oracle',type=Path);p.add_argument('replay',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
    report=verify(args.oracle,args.replay,args.output);print(json.dumps(report));raise SystemExit(0 if report['passed'] else 1)
