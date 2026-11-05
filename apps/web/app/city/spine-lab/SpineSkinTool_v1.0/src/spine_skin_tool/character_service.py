"""Transport-neutral service; CLI and loopback HTTP call the same operations."""
import json
from pathlib import Path
from .design import (ROOT,freeze_design,load_design,draft_design,keys,require,private_path,VERSIONS)
from .character_flow import prepare_requests,bindings_from_directory,assemble_character


def configuration(root=ROOT):
    from .generation import character_references
    folder=private_path(root,'runtime/work/M04/character-flow/designs');designs=[]
    if folder.is_dir():
        for path in sorted(folder.glob('design-*.json'))[:1000]:
            try:
                record=load_design(root,path.stem.removeprefix('design-'))
                designs.append({'design_id':record['design_id'],'character_id':record['design']['character_id'],'photo':record['design']['photo']['file']})
            except (ValueError,OSError,KeyError,TypeError):continue
    return {'photos':character_references(root),'designs':designs,'workflow_revision':VERSIONS['workflow']['revision'],'schema_version':VERSIONS['product']['design_schema']}


def dispatch(action,payload,root=ROOT):
    root=Path(root).resolve()
    if action=='draft':
        keys(payload,('photo','character_id','preset'),'CHARACTER_REQUEST_KEYS')
        return {'status':'EDITABLE_EXAMPLE_NOT_PHOTO_ANALYSIS','design':draft_design(root,payload['photo'],payload['character_id'],payload['preset'])}
    if action=='freeze':
        keys(payload,('design',),'CHARACTER_REQUEST_KEYS');return freeze_design(root,payload['design'])
    if action in ('load','requests'):
        keys(payload,('design_id',),'CHARACTER_REQUEST_KEYS')
        if action=='load':return load_design(root,payload['design_id'])
        plan,path=prepare_requests(root,payload['design_id'])
        return {'status':'REQUEST_ONLY_NO_MODEL_CALL','plan':plan,'output':path.relative_to(root).as_posix(),'model_calls':0}
    require(action=='assemble','CHARACTER_ACTION')
    require(isinstance(payload,dict) and {'design_id','output'}<=set(payload) and not set(payload)-{'design_id','output','raw_directory','bindings','auto_fit'},'CHARACTER_REQUEST_KEYS')
    bindings=bindings_from_directory(root,payload['design_id'],payload['raw_directory']) if payload.get('raw_directory') else {}
    overrides=payload.get('bindings',{});require(isinstance(overrides,dict),'PART_BINDING_KEYS')
    bindings.update(overrides)
    return assemble_character(root,payload['design_id'],bindings,payload['output'],payload.get('auto_fit',False))
