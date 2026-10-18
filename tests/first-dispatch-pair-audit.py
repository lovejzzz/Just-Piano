import copy
import pathlib
import sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from pianoteq_audit_first_dispatch_pair import compare_states
s={'groups':[[0,4,1,1]],'lanes':[{'group':0,'lane':0,'words':{'A':0}}],'counter':0}
t=copy.deepcopy(s);t['lanes'][0]['words']['A']=0x80000000
r=compare_states(s,t)
assert r['differentRawWordsByField']=={'A':1} and r['rawWordsCompared']==1
assert r['rawStorageInitializationAndConsumptionProven'] is False
for change in ['missing','layout','invalid']:
 t=copy.deepcopy(s)
 if change=='missing':t['lanes']=[]
 elif change=='layout':t['groups']=[[1,4,1,1]];t['lanes'][0]['lane']=1
 else:t['lanes'][0]['words']['A']=-1
 try:compare_states(s,t)
 except ValueError:pass
 else:raise AssertionError('Invalid '+change+' accepted')
print('first-dispatch comparison tests passed')
