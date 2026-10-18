import importlib.util
from pathlib import Path
import struct
spec=importlib.util.spec_from_file_location('spatial_pair_audit',Path(__file__).resolve().parents[1]/'scripts/pianoteq_audit_spatial_native_pair.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
x=bytes(1536);y=bytearray(x);struct.pack_into('<I',y,20,0x80000000)
r=a.keyed({(0,0):x},{(0,0):bytes(y)},6)
assert r['inventoryEqual'] and r['differingFloatSamples']==1 and r['firstMismatch']['sample']==5
r=a.keyed({(0,0):x,(0,64):x},{(0,64):x,(0,0):x},6)
assert r['inventoryEqual'] and r['differingFloatSamples']==0
r=a.keyed({(0,0):x},{(0,0):x,(0,64):x},6)
assert not r['inventoryEqual'] and r['missingInA']==[[0,64]] and r['samplesComparedOnCommonBlocks']==384
fmt={'channels':2,'sampleWidth':3,'sampleRate':48000,'frames':1}
r=a.pcm_compare({'pcm':bytes(6),'format':fmt},{'pcm':bytes([255,255,255,0,0,0]),'format':fmt})
assert r['differingInterleavedSamples']==1 and r['maximumIntegerDifference']==1 and r['firstDifferenceFrame']==0
r=a.pcm_compare({'pcm':bytes(6),'format':fmt},{'pcm':bytes(12),'format':{**fmt,'frames':2}})
assert not r['completeExtentEqual'] and not r['completePcmEqual'] and 'differingInterleavedSamples' not in r
print('Keyed full-row bit comparison, signed zero, missing inventory and full PCM extent checks passed (synthetic).')
