"""Evidence-bound ear visibility, independent of the model's proposed ear_mode."""
import hashlib,json
from .design import require,keys,photo_path,digest,private_path
from .assembly import canonical

REVISION='ear-visibility-002'
VALUES=('VISIBLE','HAIR_OCCLUDED','UNCLEAR')

def observation(value):
 keys(value,('left','right','reason_ja'),'EAR_OBSERVATION_KEYS')
 require(value['left'] in VALUES and value['right'] in VALUES,'EAR_OBSERVATION_VALUE')
 require(isinstance(value['reason_ja'],str) and 0<len(value['reason_ja'])<=1400,'EAR_OBSERVATION_REASON')
 return {**value}

def choose(value):
 value=observation(value)
 return 'HIDDEN' if value['left']==value['right']=='HAIR_OCCLUDED' else 'PARTIAL_BOTH'

def record(root,state,value,source):
 value=observation(value);require(source in ('MODEL_PHOTO_ANALYSIS','USER_AND_PHOTO_REVIEW'),'EAR_REVIEW_SOURCE')
 data={'revision':REVISION,'flow_id':state['id'],'photo':state['photo'],'photo_sha256':digest(photo_path(root,state['photo'])),'source':source,'observation':value,'mode':choose(value),'previous_mode':state.get('ear_mode'),'quality_approved':False}
 identity=hashlib.sha256(canonical(data)).hexdigest();folder=private_path(root,'runtime/work/M08/ear-decisions');folder.mkdir(parents=True,exist_ok=True);path=folder/(identity+'.json')
 if not path.exists():path.write_bytes(canonical(data)+b'\n')
 require(json.loads(path.read_text(encoding='utf-8'))==data,'EAR_DECISION_CHANGED');return identity

def load(root,identity):
 require(isinstance(identity,str) and __import__('re').fullmatch('[a-f0-9]{64}',identity),'EAR_DECISION_ID')
 data=json.loads(private_path(root,'runtime/work/M08/ear-decisions/'+identity+'.json').read_text(encoding='utf-8'))
 require(hashlib.sha256(canonical(data)).hexdigest()==identity and data['revision']==REVISION,'EAR_DECISION_CHANGED')
 require(digest(photo_path(root,data['photo']))==data['photo_sha256'] and choose(data['observation'])==data['mode'],'EAR_DECISION_PHOTO_CHANGED');return data
