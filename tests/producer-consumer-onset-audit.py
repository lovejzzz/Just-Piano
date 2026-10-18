import copy
import hashlib
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from pianoteq_audit_producer_consumer_onsets import bind
from pianoteq_audit_modal_cache_onsets import FIELDS
records=[];audio={};serial=0
for epoch in range(5):
 for age in [0,64]:
  serial+=3;voice='voice-'+str(epoch);before={'counter':age,'initialFlag':int(age==0),'groups':[[0,4,1,1]],'lanes':[{'group':0,'lane':0,'words':{k:0 for k in FIELDS}}]};after=copy.deepcopy(before);after.update(counter=age+64,initialFlag=0)
  data=bytes([epoch*2+age//64])*768;p='p-'+str(epoch)+'-'+str(age);c='c-'+str(epoch)+'-'+str(age);audio[p]=data;audio[c]=data
  records.append({'stage':'produced','voice':voice,'counter':age,'path':'cache','caller':'0x100416778','entrySerial':serial-2,'exitSerial':serial-1,'entryThreadIndex':27,'exitThreadIndex':27,'entryMode':1,'before':before,'after':after,'audioFile':p})
  records.append({'stage':'consumed','voice':voice,'counter':age,'serial':serial,'threadIndex':1,'audioFile':c})
one,_=bind(records[:4],audio,required_voices=1);assert one['blocks']==2 and one['samplesCompared']==384 and one['exactBindingVerified']
r,_=bind(records,audio);assert r['exactBindingVerified'] and r['blocks']==10 and r['samplesCompared']==1920
changed=dict(audio);b=bytearray(changed['c-0-0']);b[0]^=1;changed['c-0-0']=bytes(b)
r,_=bind(records,changed);assert not r['exactBindingVerified'] and r['differingSamples']==1
for case in ['missing','duplicate','future','thread','caller']:
 x=copy.deepcopy(records)
 if case=='missing':x.pop()
 elif case=='duplicate':x.append(copy.deepcopy(x[0]))
 elif case=='future':x[0]['exitSerial']=x[1]['serial']+1
 elif case=='thread':x[0]['exitThreadIndex']=28
 else:x[0]['caller']='0x0'
 try:bind(x,audio)
 except ValueError:pass
 else:raise AssertionError('Invalid '+case+' accepted')
print('Producer/consumer binding, full inventory, same call and one-bit tests passed')
