"""Append-only repair state, atomic projections and cross-process owner leases."""
import contextlib,json,os,re,uuid,time
from pathlib import Path
from .assembly import canonical
from .design import private_path,require,digest


def directory(root,identity,kind='repair'):
    require(kind in ('repair','flow','texture'),'STORE_KIND')
    require(isinstance(identity,str) and re.fullmatch(kind+r'-[a-f0-9]{32}',identity),{'repair':'REPAIR_ID','flow':'FLOW_ID','texture':'TEXTURE_EDIT_ID'}[kind])
    return private_path(root,'runtime/work/'+('M06' if kind=='repair' else 'M07')+('/texture-edits/' if kind=='texture' else '/tasks/')+identity)


def atomic(path,value):
    temporary=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    with temporary.open('wb') as stream:stream.write(canonical(value)+b'\n');stream.flush();os.fsync(stream.fileno())
    temporary.replace(path)


def read(root,identity,kind='repair'):
    folder=directory(root,identity,kind);previous=None;state=None
    for file in sorted((folder/'events').glob('*.json')):
        safe=private_path(root,file.relative_to(Path(root)).as_posix());record=json.loads(safe.read_text(encoding='utf-8'))
        require(record['previous']==previous and record['state']['id']==identity,'REPAIR_EVENT_CHAIN')
        require(record['sequence']==(1 if state is None else state['sequence']+1),'REPAIR_EVENT_SEQUENCE')
        require(record['state_sha256']==__import__('hashlib').sha256(canonical(record['state'])).hexdigest(),'REPAIR_STATE_CHANGED')
        previous=digest(safe);state=record['state']
    require(state is not None,'REPAIR_NOT_FOUND');return state


def commit(root,state,event,kind='repair'):
    folder=directory(root,state['id'],kind);events=folder/'events';events.mkdir(exist_ok=True)
    files=sorted(events.glob('*.json'));state['sequence']=len(files)+1
    record={'sequence':state['sequence'],'event':event,'recorded_at':time.time(),'previous':digest(files[-1]) if files else None,'state':state,'state_sha256':__import__('hashlib').sha256(canonical(state)).hexdigest()}
    target=events/f"{state['sequence']:06d}.json";require(not target.exists(),'REPAIR_EVENT_CONFLICT');atomic(target,record)
    atomic(folder/'state.json',state);return state


@contextlib.contextmanager
def lease(root,identity,name='worker.lock',wait=False,kind='repair'):
    # Native advisory locks are released by the OS on process death. Never delete
    # or replace the locked inode, and never guess ownership from a reused PID.
    require(name in ('worker.lock','decision.lock'),'REPAIR_LOCK_NAME')
    folder=directory(root,identity,kind);path=private_path(root,(folder/name).relative_to(Path(root)).as_posix())
    with path.open('a+b') as stream:
        if path.stat().st_size==0:stream.write(b'0');stream.flush()
        stream.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(stream.fileno(),msvcrt.LK_LOCK if wait else msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(),fcntl.LOCK_EX|(0 if wait else fcntl.LOCK_NB))
        except OSError:require(False,'REPAIR_BUSY')
        try:
            atomic(folder/(name+'.owner.json'),{'pid':os.getpid(),'token':uuid.uuid4().hex});yield
        finally:
            stream.seek(0)
            if os.name=='nt':msvcrt.locking(stream.fileno(),msvcrt.LK_UNLCK,1)
            else:fcntl.flock(stream.fileno(),fcntl.LOCK_UN)


def cancel(root,identity,kind='repair'):
    folder=directory(root,identity,kind);read(root,identity,kind)
    with lease(root,identity,'decision.lock',wait=True,kind=kind):
        try:
            with (folder/'cancel.requested').open('x') as stream:stream.write('CANCEL_FUTURE_STEPS_ONLY')
        except FileExistsError:pass
    return {'id':identity,'status':'CANCEL_REQUESTED','message_ja':'後続処理を停止します。既に送信された外部処理は撤回できません。'}
