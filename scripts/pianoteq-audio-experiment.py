#!/usr/bin/env python3
"""Render controlled MIDI through the installed Pianoteq CLI, then measure PCM.
Requires numpy; never accesses user preferences or changes the application binary.
"""
import argparse, hashlib, json, math, struct, subprocess, wave
from pathlib import Path
import numpy as np

APP='/Applications/Pianoteq 9/Pianoteq 9.app/Contents/MacOS/Pianoteq 9'
def vlq(n):
    out=[n&127]; n >>= 7
    while n: out.insert(0,(n&127)|128); n >>= 7
    return bytes(out)
def midi(path, events, end=10):
    # 960 ticks/s: PPQ 480, tempo 500000 microseconds/quarter.
    events=[(0,b'\xff\x51\x03\x07\xa1\x20')]+events+[(end,b'\xff\x2f\x00')]
    data=b''; last=0
    for seconds,msg in sorted(events,key=lambda e:e[0]):
        tick=round(seconds*960); data+=vlq(tick-last)+msg; last=tick
    path.write_bytes(b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(data))+data)
def events(velocity=96,release=1.5,sustain=False,soft=False,retrigger=False):
    e=[(0,bytes([0xb0,64,0])),(0,bytes([0xb0,67,127 if soft else 0])),(.5,bytes([0x90,69,velocity])),(release,bytes([0x80,69,64]))]
    if sustain:e +=[(.25,bytes([0xb0,64,127])),(5.5,bytes([0xb0,64,0]))]
    if retrigger:e +=[(2.5,bytes([0x90,69,velocity])),(3.5,bytes([0x80,69,64]))]
    return e

def load(path):
    with wave.open(str(path),'rb') as w:
        assert w.getsampwidth()==2
        rate=w.getframerate(); channels=w.getnchannels(); samples=np.frombuffer(w.readframes(w.getnframes()),'<i2').astype(float).reshape(-1,channels)/32768
    return samples,rate

def db(v):return float(20*np.log10(max(float(v),1e-15)))
def measure(path):
    x,sr=load(path); mono=x.mean(axis=1)
    def segment(a,b):return x[int(a*sr):int(b*sr)]
    windows={}
    for a,b in [(0,.4),(.5,.7),(.7,1.4),(1.6,2),(2,3),(3,4),(4,5),(5.6,6),(6,7),(8,9)]:
        z=segment(a,b); windows[f'{a:g}-{b:g}']=db(np.sqrt(np.mean(z*z))) if z.size else None
    z=mono[int(.55*sr):int(.95*sr)]; power=np.abs(np.fft.rfft(z*np.hanning(len(z))))**2; hz=np.fft.rfftfreq(len(z),1/sr)
    valid=(hz>=100)&(hz<=12000)
    centroid=float(np.sum(hz[valid]*power[valid])/np.sum(power[valid])) if power.sum() else None
    high=float(power[(hz>=3000)&(hz<=12000)].sum()/power[valid].sum()) if power.sum() else None
    return {'rate':sr,'channels':x.shape[1],'duration_seconds':len(x)/sr,'peak_dbfs':db(np.max(np.abs(x))), 'nonzero_samples':int(np.count_nonzero(x)),'rms_dbfs_windows_seconds':windows,'power_centroid_100_12000_hz':centroid,'power_fraction_3000_12000_hz':high,'wav_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);p.add_argument('--fresh-prefs',action='store_true',help='Diagnostic only: use a separate saved preference file per case');p.add_argument('--analyze-only',action='store_true');args=p.parse_args();args.out.mkdir(parents=True,exist_ok=args.analyze_only)
    cases={f'velocity_{v}':events(v) for v in [32,64,96,127]}
    cases.update(baseline_repeat=events(),held=events(release=5.5),sustain=events(sustain=True),soft=events(soft=True),retrigger=events(retrigger=True),sustain_retrigger=events(sustain=True,retrigger=True))
    summary={'preset':'NY Steinway D Mix','note':69,'note_on_seconds':.5,'default_note_off_seconds':1.5,'sustain_release_seconds':5.5,'normalization':False,'dither':False,'results':{}}
    for name,ev in cases.items():
        mid=args.out/(name+'.mid');wav=args.out/(name+'.wav')
        if not args.analyze_only:
            midi(mid,ev)
            command=[APP,'--headless']+(['--prefs',str(args.out/(name+'.prefs'))] if args.fresh_prefs else ['--no-prefs'])+['--preset',summary['preset'],'--midi',str(mid),'--wav',str(wav),'--rate','48000','--bit-depth','16','--dither','OFF']
            run=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
            (args.out/(name+'.log')).write_text(run.stdout)
            (args.out/(name+'.command.json')).write_text(json.dumps(command,ensure_ascii=False,indent=2))
            if run.returncode:raise RuntimeError((name,run.returncode,run.stdout))
        summary['results'][name]=measure(wav);print(name,json.dumps(summary['results'][name]),flush=True)
    a,sr=load(args.out/'velocity_96.wav');b,_=load(args.out/'baseline_repeat.wav');n=min(len(a),len(b)); delta=a[:n]-b[:n]
    summary['repeat']={'same_shape':a.shape==b.shape,'bit_identical':bool(a.shape==b.shape and np.array_equal(a,b)),'difference_rms_dbfs':db(np.sqrt(np.mean(delta*delta))),'correlation':float(np.corrcoef(a[:n].ravel(),b[:n].ravel())[0,1]) if np.std(a[:n]) and np.std(b[:n]) else None}
    (args.out/('measurements-reanalysis.json' if args.analyze_only else 'measurements.json')).write_text(json.dumps(summary,indent=2));print('repeat',summary['repeat'])
if __name__=='__main__':main()
