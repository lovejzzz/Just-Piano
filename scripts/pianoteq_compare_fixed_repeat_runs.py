import json,struct
from pathlib import Path
import argparse,math
parser=argparse.ArgumentParser(description='Compare completed fixed offline control/source windows without address identity across runs.')
parser.add_argument('left',type=Path);parser.add_argument('right',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
a=json.load(open(args.left));b=json.load(open(args.right))
for r in [a,b]:
 assert r['schema']==1 and r['fixedSites'] and r['complete'] and r['activeSites']==0 and not r['errors'] and r['producerCount']==5 and r['hardnessCount']==10 and len(r['records'])==20

def index(r):
 rows={};owners={}
 for item in r['records']:
  if item['stage']=='before':
   assert item['ordinal']==len(owners) and item['newVoice'] not in owners
   owners[item['newVoice']]=item['ordinal'];rows[(item['ordinal'],'before')]=item['inputs']
  elif item['stage']=='after':
   assert owners[item['newVoice']]==item['ordinal'] and (item['ordinal'],'after') not in rows
   rows[(item['ordinal'],'after')]=item['actual']
  else:
   assert item['stage']=='hardness'
   assert item['input']['mode'] in (0,1)
   key=(owners[item['newVoice']],'hardness'+str(item['input']['mode']));assert key not in rows
   rows[key]={'input':item['input'],'actual':item['actual']}
 return rows
x,y=index(a),index(b);assert x.keys()==y.keys();changes=[];checked=0

def walk(a,b,path):
 global checked
 if isinstance(a,dict):
  assert a.keys()==b.keys()
  for k in a:walk(a[k],b[k],path+'.'+k)
 elif isinstance(a,list):
  if len(a)!=len(b):changes.append({'path':path,'shape':[len(a),len(b)]});return
  for i,(u,v) in enumerate(zip(a,b)):walk(u,v,path+f'[{i}]')
 elif isinstance(a,(int,float)) and not isinstance(a,bool):
  checked+=1
  assert math.isfinite(a) and math.isfinite(b)
  different=(a!=b) if isinstance(a,int) and isinstance(b,int) else struct.pack('<f',a)!=struct.pack('<f',b)
  if different:changes.append({'path':path,'a':a,'b':b})
 else:
  checked+=1
  if a!=b:changes.append({'path':path,'a':a,'b':b})
for k in x:walk(x[k],y[k],str(k))
result={'checked':checked,'differences':len(changes),'changes':changes};args.output.write_text(json.dumps(result,indent=2));print(json.dumps({'checked':checked,'differences':len(changes),'firstChanges':changes[:20]}))
