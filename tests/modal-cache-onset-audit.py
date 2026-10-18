import copy
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from pianoteq_audit_modal_cache_onsets import validate_state, state_comparison, FIELDS
s={'groups':[[0,4,1,1]],'lanes':[{'group':0,'lane':0,'words':{k:0 for k in FIELDS}}],'counter':64,'initialFlag':0}
validate_state(s)
t=copy.deepcopy(s);t['groups']=[[0,4,2,2]];t['lanes'].append({'group':0,'lane':1,'words':{k:0 for k in FIELDS}});validate_state(t)
r=state_comparison(s,t)
assert r['layoutEqual'] is False and r['laneComparison'] is None and r['entireObservedStateEqual'] is False
# Identical scalar controls and common lanes do not turn a different layout into equivalence.
t=copy.deepcopy(s);t['counter']=512
r=state_comparison(s,t)
assert r['modalCounterA']==64 and r['modalCounterB']==512 and not r['entireObservedStateEqual']
t=copy.deepcopy(s);t['lanes'][0]['words']['A']=0x80000000
assert state_comparison(s,t)['laneComparison']['differentRawWordsByField']=={'A':1}
for change in ['missing','raw','initial','overlap']:
 t=copy.deepcopy(s)
 if change=='missing':t['lanes']=[]
 elif change=='raw':t['lanes'][0]['words']['A']=-1
 elif change=='initial':t['initialFlag']=1
 else:t['groups'].append([0,4,0,0])
 try:validate_state(t)
 except ValueError:pass
 else:raise AssertionError('Invalid '+change+' accepted')
print('modal/cache onset audit tests passed')
