"""Allowlisted source distribution, with no traversal through private runtime data."""
import hashlib,json,re,zipfile
from pathlib import Path
from .design import require

EXTENSIONS={'.py','.js','.cjs','.html','.css','.json','.toml','.yaml','.yml','.md','.txt','.sql'}
SYNTHETIC={'fixtures/synthetic/shared-design/character-reference.png':'07eb2275e52cd6d97e2b93101c2d330465d40a57f25959fbfc1574dbc46a772b'}
SECRET_PATTERNS=[rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{25,}',rb'\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{25,}',rb'\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']

def policy(root):return json.loads((Path(root)/'DISTRIBUTION.json').read_text(encoding='utf-8'))

def release_files(root):
    root=Path(root).resolve();p=policy(root);names=set(p['source_top'])
    names.update('docs/'+n for n in p['public_docs']);names.update('runtime/'+n for n in p['runtime_files'])
    for folder in p['source_directories']:
        base=root/folder
        if not base.exists():continue
        require(not base.is_symlink() and not (hasattr(base,'is_junction') and base.is_junction()),'RELEASE_LINK')
        for path in base.rglob('*'):
            require(not path.is_symlink() and not (hasattr(path,'is_junction') and path.is_junction()),'RELEASE_LINK')
            if path.is_file() and path.suffix in EXTENSIONS and '__pycache__' not in path.parts:names.add(path.relative_to(root).as_posix())
    names.update(SYNTHETIC);files=[]
    reference_files={};reference_folder=p.get('reference_directory')
    if reference_folder:
        require(reference_folder=='references/spine','RELEASE_REFERENCE_PATH')
        from .reference_assets import verify_bundled
        reference_files=verify_bundled(root)['files']
        names.update(reference_folder+'/'+n for n in reference_files)
        names.update((reference_folder+'/ASSET_MANIFEST.json',reference_folder+'/REFERENCE_ONLY.md'))
    for name in sorted(names):
        rel=Path(name);require(not rel.is_absolute() and '..' not in rel.parts,'RELEASE_PATH')
        require(rel.name.lower() not in ('auth.json','credentials.json','providers.json','review.json','design.json') or name=='fixtures/synthetic/shared-design/design.json','RELEASE_PRIVATE_FILE')
        path=root/name
        require(not any(part.lower() in ('secrets','.codex','node_modules','.venv') for part in rel.parts),'RELEASE_PRIVATE_PATH')
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),'RELEASE_MISSING_FILE')
        require(not any(q.is_symlink() or (hasattr(q,'is_junction') and q.is_junction()) for q in path.parents if q.is_relative_to(root)),'RELEASE_LINK')
        if name in SYNTHETIC:require(hashlib.sha256(path.read_bytes()).hexdigest()==SYNTHETIC[name],'RELEASE_SYNTHETIC_CHANGED')
        elif reference_folder and name.startswith(reference_folder+'/') and name[len(reference_folder)+1:] in reference_files:
            pass  # Exact reference bytes were pinned and checked above, not arbitrary images.
        elif path.suffix!='.png':
            data=path.read_bytes()
            require(not any(re.search(rule,data) for rule in SECRET_PATTERNS),'RELEASE_SECRET_PATTERN')
        files.append(path)
    return files

def audit(root):
    root=Path(root).resolve();p=policy(root);files=release_files(root)
    return {'status':'PASS','release_id':p['release_id'],'files':{f.relative_to(root).as_posix():{'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size,'category':'REFERENCE_ONLY_NONCOMMERCIAL' if f.relative_to(root).as_posix().startswith('references/spine/') else 'DEVELOPMENT' if f.relative_to(root).parts[0]=='tests' or f.name.startswith(('check_','capture_')) else 'PRODUCT_SOURCE'} for f in files},'excluded':{kind:p[kind] for kind in ('private_directories','rebuildable_directories','local_history_directories')},'credentials_included':False,'reference_art_included':bool(p.get('reference_directory')),'reference_only':True,'commercial_use_allowed':False,'production_approved':False}

def build(root,output):
    root=Path(root).resolve();output=Path(output).absolute()
    require(output.resolve().is_relative_to(root/'runtime/output/M08') and not output.exists() and output.suffix=='.zip','RELEASE_DESTINATION')
    value=audit(root);output.parent.mkdir(parents=True,exist_ok=True)
    require(output.parent.resolve().is_relative_to(root),'RELEASE_PATH')
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr('RELEASE-MANIFEST.json',json.dumps(value,ensure_ascii=False,indent=2)+'\n')
        for name,item in value['files'].items():
            data=(root/name).read_bytes();require(hashlib.sha256(data).hexdigest()==item['sha256'],'RELEASE_SOURCE_CHANGED');z.writestr(name,data)
    with zipfile.ZipFile(output) as z:
        require(set(z.namelist())=={'RELEASE-MANIFEST.json',*value['files']},'RELEASE_CONTENTS')
        require(all(hashlib.sha256(z.read(n)).hexdigest()==i['sha256'] for n,i in value['files'].items()),'RELEASE_HASH')
    return {'status':'PASS','files':len(value['files']),'archive_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'credentials_included':False,'production_approved':False}
