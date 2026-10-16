"""Fixed-site note-off velocity through raw keys and continuous global modes."""
import json,os,traceback,hashlib
from pathlib import Path
import pianoteq_capture_global_recurrence as modal
import pianoteq_capture_global_control_producer as control
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'initial':0x1006c2ac4,'key':0x10083a7c0,'raw':0x100096558,'body':0x100804a14,'bodyResult':0x1006c2bf8,'noteOff':0x1005b5698,'noteOffResult':0x1005b5808,'powInput':0x1005b57f8,'powResult':0x1005b57fc}
LIMIT=128
records,errors,transitions,event_records=[],[],[],[]
hooks={};owner=None;initial=None;initial_keys=None;curves={};blocks=0;complete=False;pending=[];body_pending=None;active_manager=None;event_pending={}

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumBlocks':LIMIT,'blocks':blocks,
  'configs':modal.configs,'initial':initial,'initialKeys':initial_keys,'curves':curves,'records':records,'eventRecords':event_records,'transitions':transitions,'errors':errors},indent=2,allow_nan=False))

def keys(frame,full=False):
 begin=scalar(frame,owner+0x10,'Q');end=scalar(frame,owner+0x18,'Q');assert (end-begin)%128==0
 n=(end-begin)//128;assert 0<n<=128
 rows=[]
 for i in range(n):
  p=begin+i*128;r={'raw':scalar(frame,p+0x20),'value':scalar(frame,p+0x24),'flag':scalar(frame,p+0x28,'B')}
  if full:
   b=scalar(frame,p+8,'Q');e=scalar(frame,p+16,'Q');assert (e-b)%4==0 and 0<=(e-b)//4<=8192
   count=(e-b)//4;indices=[]
   for offset in range(0,count,4096):indices.extend(unpack(frame,b+4*offset,'I'*min(4096,count-offset)))
   r['modes']=indices
  rows.append(r)
 return rows

def key_nodes(frame,key):
 nodes=[];node=scalar(frame,key+0x20,'Q');visited=set()
 while node:
  assert node not in visited and len(nodes)<16;visited.add(node)
  nxt=scalar(frame,node+0x18,'Q');voice=scalar(frame,node+0x20,'Q')
  nodes.append({'object':hex(node),'position':scalar(frame,node),'intermediate':scalar(frame,node+4),
   'velocity':scalar(frame,node+8),'id':scalar(frame,node+0xc,'I'),'tag':scalar(frame,node+0x10,'I'),
   'mask':scalar(frame,node+0x28,'I'),'voice':hex(voice),'voiceAmplitude':scalar(frame,voice+0x78) if voice else None,'next':hex(nxt)})
  node=nxt
 return nodes

def record_math_transition(stage):
 active=[key for key,h in hooks.items() if h.IsEnabled()]
 assert len(active)<=4
 transitions.append({'ordinal':blocks,'phase':'math','next':stage,'activeSites':len(active),'enabled':active})

def phase(name):
 desired={'between':{'raw','noteOff','noteOffResult'},'compute':{'raw','key','body','bodyResult'}}[name]
 for key,h in hooks.items():
  if key not in desired:h.SetEnabled(False)
 for key,h in hooks.items():
  if key in desired:h.SetEnabled(True)
 active=[key for key,h in hooks.items() if h.IsEnabled()]
 assert set(active)==desired and len(active)<=4
 transitions.append({'ordinal':blocks,'phase':name,'activeSites':len(active),'enabled':active})

def raw_keys(frame,manager):
 host=scalar(frame,manager+0xc08,'Q');root=scalar(frame,manager+0xe00,'Q');shared=scalar(frame,root+0x50,'Q')
 begin=scalar(frame,manager+0xc88,'Q');end=scalar(frame,manager+0xc90,'Q');assert (end-begin)%320==0 and (end-begin)//320==len(initial_keys)
 bypass=[scalar(frame,scalar(frame,scalar(frame,manager+0xe48,'Q')+0x50,'Q')+0xc,'B'),
  scalar(frame,scalar(frame,scalar(frame,manager+0xe50,'Q')+0x58,'Q')+0xc,'B')]
 assert bypass==[0,0],'Active extra key processors need separate recovery'
 rows=[]
 for i in range(len(initial_keys)):
  p=begin+i*320;nodes=key_nodes(frame,p)
  rows.append({'flags':[scalar(frame,p+o,'B') for o in (0x1c,0x1d,0x1e)],
   'localControl':scalar(frame,p+0x30),'localSoftControl':scalar(frame,p+0x34),'nodes':nodes})
 return {'manager':hex(manager),'samples':scalar(frame,host+0x198,'I'),'sampleRate':scalar(frame,host+0xc),
  'hostControl':scalar(frame,host+0xc0),'hostBlend':scalar(frame,host+0xbc),
  'softControl':scalar(frame,root+0xe8),'pedalControl':scalar(frame,root+0x90),
  'binaryPedal':scalar(frame,shared+0x18,'B'),'bypassFlags':bypass,'keys':rows}

def curve(frame,p):
 n=scalar(frame,p+0x30,'Q');assert n<=8192
 c={'dimension':1,'log_x':0,'special_mode':0,
  'x':floats(frame,scalar(frame,p+0x20,'Q'),n) if n else [],
  'y':floats(frame,scalar(frame,p+0x28,'Q'),max(1,n))}
 digest=hashlib.sha256(json.dumps(c,separators=(',',':'),allow_nan=False).encode()).hexdigest()
 if digest not in curves:curves[digest]=c
 return digest

def observed(frame,location,_):
 global owner,initial,initial_keys,blocks,complete,body_pending,active_manager
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='noteOff':
   if active_manager is None:return False
   key=register(frame,'x0');begin=scalar(frame,active_manager+0xc88,'Q');end=scalar(frame,active_manager+0xc90,'Q')
   if not (begin<=key<end and (key-begin)%320==0):return False
   assert thread not in event_pending and body_pending is None
   event_pending[thread]=key
   event_records.append({'stage':stage,'thread':thread,'ordinal':blocks,'key':(key-begin)//320,
    'object':hex(key),'release':regfloat(frame,'s0','f'),'id':register(frame,'w1'),'tag':register(frame,'w2'),
    'clearMask':register(frame,'w3'),'negativeOnly':register(frame,'w4'),
    'controls':{'baseTime':scalar(frame,key+0x38),'maximumTime':scalar(frame,key+0x3c),'amplitudeScale':scalar(frame,key+0x40)},
    'nodes':key_nodes(frame,key)})
   hooks['powInput'].SetEnabled(True)
   record_math_transition('powInput')
  elif stage in ('powInput','powResult'):
   assert thread in event_pending
   event_records.append({'stage':stage,'thread':thread,'ordinal':blocks,'node':hex(register(frame,'x23')),
    **({'base':regfloat(frame,'s0','f'),'exponent':regfloat(frame,'s1','f')} if stage=='powInput' else {'result':regfloat(frame,'s0','f')})})
   hooks[stage].SetEnabled(False);hooks['powResult' if stage=='powInput' else 'powInput'].SetEnabled(True)
   record_math_transition('powResult' if stage=='powInput' else 'powInput')
  elif stage=='noteOffResult':
   if thread not in event_pending:return False
   key=event_pending.pop(thread)
   for name in ('powInput','powResult'):hooks[name].SetEnabled(False)
   record_math_transition('done')
   event_records.append({'stage':stage,'thread':thread,'ordinal':blocks,'object':hex(key),'nodes':key_nodes(frame,key)})
  elif stage=='initial':
   assert initial is None and blocks==0
   root=register(frame,'x0');obj=scalar(frame,root+0x58,'Q');d=modal.dispatch(frame,obj,True)
   owner=int(d['state'],16);initial=control.snapshot(frame,owner,True);initial_keys=keys(frame,True)
   initial['rawGlobalControl']=scalar(frame,owner+0x170)
   hooks['initial'].SetEnabled(False)
   for name in ('key','raw'):hooks[name].SetEnabled(True)
   transitions.append({'ordinal':0,'disable':'initial','enable':['key','raw'],'activeSites':sum(h.IsEnabled() for h in hooks.values())});assert transitions[-1]['activeSites']==4
  elif stage=='raw':
   assert owner is not None and body_pending is None
   phase('compute');assert not event_pending
   manager=register(frame,'x0');active_manager=manager;root=scalar(frame,manager+0xe00,'Q')
   assert scalar(frame,scalar(frame,root+0x58,'Q')+0x1b0,'Q')==owner
   pending.append({'stage':stage,'ordinal':blocks,'thread':thread,'snapshot':raw_keys(frame,manager),
    'actualDt':regfloat(frame,'s0','f')})
  elif stage=='key':
   assert owner is not None and body_pending is None
   obj=register(frame,'x0')
   if scalar(frame,obj+0x1b0,'Q')!=owner:return False
   source=register(frame,'x1');n=scalar(frame,source+8,'Q');assert n==len(initial_keys)
   assert pending and pending[-1]['stage']=='raw';manager=int(pending[-1]['snapshot']['manager'],16)
   pending.append({'stage':stage,'ordinal':blocks,'thread':thread,'curve':curve(frame,register(frame,'x2')),
    'rawInputs':floats(frame,scalar(frame,source,'Q'),n),'flags':list(unpack(frame,scalar(frame,source+0x28,'Q'),'B'*n)),
    'before':keys(frame),'sourceAfter':raw_keys(frame,manager)})
  elif stage=='body':
   assert initial is not None and body_pending is None
   obj=register(frame,'x0');d=modal.dispatch(frame,obj,True);assert int(d['state'],16)==owner
   for event in pending:assert event['ordinal']==blocks and event['thread']==thread
   records.extend(pending);pending.clear()
   body_pending={'thread':thread,'output':register(frame,'x4'),'kernels':[int(k['object'],16) for k in d['kernels']]}
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'dispatch':d,'producerAfter':control.snapshot(frame,owner),
    'keys':keys(frame),'rawGlobalControl':scalar(frame,owner+0x170),
    'inputs':[matrix(frame,register(frame,r)) for r in ('x1','x2','x3')],'outputBefore':matrix(frame,register(frame,'x4'))})
  else:
   assert body_pending is not None and body_pending['thread']==thread
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'output':matrix(frame,body_pending['output']),
    'kernels':[modal.kernel_state(frame,p) for p in body_pending['kernels']]})
   body_pending=None;blocks+=1
   if blocks==LIMIT:
    complete=True
    for h in hooks.values():h.SetEnabled(False)
    save()
   else:phase('between')
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --thread-index 1 --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks[name]=h
  if name in ('key','raw','noteOff','noteOffResult','powInput','powResult'):h.SetEnabled(False)
 save()

def resume_known_stops(debugger):
 import lldb
 assert not debugger.GetAsync()
 process=debugger.GetSelectedTarget().GetProcess();observations=[]
 for attempt in range(3):
  if process.GetState()!=lldb.eStateStopped:break
  thread=process.GetSelectedThread();frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress()
  if errors or pc not in POINTS.values() or thread.GetStopReason()!=lldb.eStopReasonException:break
  observations.append({'attempt':attempt,'pc':hex(pc),'records':len(records)})
  (ROOT/'resumed-stops.json').write_text(json.dumps(observations,indent=2)+'\n')
  error=process.Continue()
  if error.Fail():raise RuntimeError(str(error))
 save()
