"""Per-character CLI conversation ownership and durable send intents, no transport."""
import contextlib,json,re,time,uuid
from pathlib import Path
from .design import private_path,photo_path,digest,require,VERSIONS
from .assembly import canonical
from .pipeline_store import atomic,read


def active(state):return state.get('versions',{}).get('workflow')=='photo-to-skin-shared-014' and state.get('mode')=='GENERATE'


def location(root,flow):
 require(re.fullmatch(r'flow-[a-f0-9]{32}',flow or ''),'SESSION_FLOW_ID')
 return private_path(root,'runtime/work/M08/character-sessions/'+flow)


def get(root,flow):
 s=read(root,flow)
 if not active(s):return None
 folder=location(root,flow);folder.mkdir(parents=True,exist_ok=True);file=folder/'session.json';sha=digest(photo_path(root,s['photo']))
 if not file.exists():
  value={'flow_id':flow,'photo_sha256':sha,'session_id':None,'status':'OPEN','pending_job':None,'parts':{},'turns':[],
         'requested_model':VERSIONS['models']['character_session_model'],'reasoning_effort':'low','created_at':time.time()}
  with file.open('xb') as f:f.write(canonical(value)+b'\n')
 value=json.loads(file.read_text(encoding='utf-8'));require(value['flow_id']==flow and value['photo_sha256']==sha,'SESSION_PHOTO_BINDING')
 return {'root':Path(root),'folder':folder,'flow_id':flow,'photo_sha256':sha}


def bind_design(root,flow,design):
 ref=get(root,flow)
 if not ref:return
 index=private_path(root,'runtime/work/M08/character-sessions/designs');index.mkdir(parents=True,exist_ok=True);p=index/(design+'.json');guard=index/'locks'/design;guard.mkdir(parents=True,exist_ok=True)
 with lock({'folder':guard}):
  v=json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'owners':[],'design_id':design,'photo_sha256':ref['photo_sha256']}
  require(v['design_id']==design and v['photo_sha256']==ref['photo_sha256'],'SESSION_DESIGN_OWNER')
  if flow not in v['owners']:v['owners'].append(flow)
  atomic(p,v)


def for_design(root,design,flow_id=None):
 if not isinstance(design,str) or not re.fullmatch('[a-f0-9]{64}',design):return None
 p=private_path(root,'runtime/work/M08/character-sessions/designs/'+design+'.json')
 if not p.exists():return None
 v=json.loads(p.read_text(encoding='utf-8'));owners=v['owners'];require(flow_id in owners if flow_id else len(owners)==1,'SESSION_AMBIGUOUS_OWNER');s=read(root,flow_id or owners[0]);require(s['design_id']==design and v['design_id']==design,'SESSION_DESIGN_OWNER');return get(root,s['id'])


def for_review(root,folder):
 folder=Path(folder)
 if folder.name=='analysis' and re.fullmatch(r'flow-[a-f0-9]{32}',folder.parent.name):return get(root,folder.parent.name)
 p=folder/'context.json'
 if p.is_file():
  c=json.loads(p.read_text(encoding='utf-8'))
  if not c.get('character_output') or not c.get('design',{}).get('design_id'):return None
  source=private_path(root,c['character_output']+'/export/bundle/flow-manifest.json');flow=json.loads(source.read_text(encoding='utf-8'));return for_design(root,c['design']['design_id'],flow.get('owner_flow_id'))
 return None


@contextlib.contextmanager
def lock(ref):
 p=ref['folder']/'turn.lock'
 with p.open('a+b') as f:
  f.seek(0);f.write(b'0');f.flush();f.seek(0)
  if __import__('os').name=='nt':
   import msvcrt
   while True:
    try:msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1);break
    except OSError:time.sleep(.05)
  else:
   import fcntl;fcntl.flock(f,fcntl.LOCK_EX)
  try:yield
  finally:
   f.seek(0)
   if __import__('os').name=='nt':msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
   else:fcntl.flock(f,fcntl.LOCK_UN)


def begin(ref,job,prompt,part=None):
 file=ref['folder']/'session.json';v=json.loads(file.read_text(encoding='utf-8'))
 require(v['flow_id']==ref['flow_id'] and v['photo_sha256']==ref['photo_sha256'],'SESSION_BINDING')
 require(v['status']=='OPEN' and not v['pending_job'],'SESSION_PENDING_OR_CLOSED')
 if part:
  require(part in ('HAIR_FRONT','HAIR_BACK','BODY_FRONT','BODY_BACK','LEG_FRONT','LEG_BACK','SKIRT_FRONT','SKIRT_BACK','EARS_FRONT','EARS_BACK'),'SESSION_PART')
  require(v['parts'].get(part,0)<4,'CHARACTER_PART_FOUR_CALL_LIMIT');v['parts'][part]=v['parts'].get(part,0)+1
 identity=Path(job).relative_to(ref['root']).as_posix();require(identity not in [t['job'] for t in v['turns']],'SESSION_JOB_ALREADY_SENT')
 v['pending_job']=identity;v['turns'].append({'job':identity,'part':part,'prompt_sha256':__import__('hashlib').sha256(prompt.encode()).hexdigest(),'started_at':time.time(),'status':'SENT_RESULT_UNKNOWN'})
 atomic(file,v);return v


def finish(ref,job,events,known):
 file=ref['folder']/'session.json';v=json.loads(file.read_text(encoding='utf-8'));identity=Path(job).relative_to(ref['root']).as_posix();require(v['pending_job']==identity,'SESSION_PENDING_BINDING');sid=v['session_id'];usage=None
 for line in Path(events).read_text(encoding='utf-8',errors='replace').splitlines() if Path(events).is_file() else []:
  try:e=json.loads(line)
  except ValueError:continue
  if e.get('type')=='thread.started':
   found=e.get('thread_id');require(isinstance(found,str) and re.fullmatch(r'[a-f0-9-]{36}',found),'SESSION_RETURNED_ID')
   require(sid is None or sid==found,'SESSION_ID_CHANGED');sid=found
  if e.get('type')=='turn.completed':usage=e.get('usage')
 v['session_id']=sid;t=v['turns'][-1];t.update(finished_at=time.time(),status='RETURNED' if known else 'SENT_RESULT_UNKNOWN')
 if isinstance(usage,dict):t['usage']={k:x for k,x in usage.items() if type(x) in (int,float)}
 if known and sid:v['pending_job']=None
 atomic(file,v)


def close(root,flow,reason):
 ref=get(root,flow)
 if not ref:return
 with lock(ref):
  p=ref['folder']/'session.json';v=json.loads(p.read_text(encoding='utf-8'));require(not v['pending_job'],'SESSION_PENDING_NOT_CLOSED');v.update(status='CLOSED',closed_at=time.time(),close_reason=reason);atomic(p,v)


def recover_returned(ref,job,events):
 if not ref:return
 with lock(ref):
  v=json.loads((ref['folder']/'session.json').read_text(encoding='utf-8'))
  if v['pending_job']==Path(job).relative_to(ref['root']).as_posix():finish(ref,job,events,True)


def public_summary(root,flow):
 p=location(root,flow)/'session.json'
 if not p.exists():return None
 v=json.loads(p.read_text(encoding='utf-8'))
 return {'mode':'PER_CHARACTER','requested_model':v['requested_model'],'image_model':'BUILTIN_NOT_EXPOSED','status':v['status'],'turns':len(v['turns']),'part_calls':v['parts'],'pending':bool(v['pending_job'])}


def command(exe,ref,state,job,schema,last,image_generation):
 cmd=[exe,'exec']
 if state['session_id']:cmd+=['resume',state['session_id']]
 else:cmd+=['--cd',str(ref['folder']),'--sandbox','read-only']
 cmd+=['--ignore-user-config','--skip-git-repo-check','--json','-m',state['requested_model'],
       '-c','model_reasoning_effort="low"','-c','sandbox_mode="read-only"','-c','forced_login_method="chatgpt"',
       '-c','features.image_generation='+('true' if image_generation else 'false'),'-c','project_doc_max_bytes=0',
       '--output-schema',str(schema),'--output-last-message',str(last)]
 return cmd
