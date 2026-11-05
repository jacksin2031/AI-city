"""Local user appearance opinions, bound to an exact candidate, not release QA."""
import json,re
from .design import private_path,require


def lookup(root,task,manifest):
    path=private_path(root,'runtime/work/M07/appearance-opinions.json')
    if not path.exists():return None
    data=json.loads(path.read_text(encoding='utf-8'))
    require(isinstance(data,list) and len(data)<=1000,'APPEARANCE_OPINIONS')
    for row in data:
        require(isinstance(row,dict) and set(row)=={'task_id','manifest_sha256','scope','accepted','message_ja'},'APPEARANCE_OPINION_KEYS')
        require(re.fullmatch(r'flow-[a-f0-9]{32}',row['task_id']) and re.fullmatch(r'[a-f0-9]{64}',row['manifest_sha256']),'APPEARANCE_OPINION_BINDING')
        require(row['scope'] in ('coarse_style','appearance','view_angle') and type(row['accepted']) is bool and isinstance(row['message_ja'],str) and 0<len(row['message_ja'])<=1000,'APPEARANCE_OPINION')
    return next((row for row in data if row['task_id']==task and row['manifest_sha256']==manifest),None)
