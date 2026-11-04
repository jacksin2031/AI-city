"""Private, relocatable licensed reference library; never include it in releases."""
import json, shutil, uuid
from pathlib import Path
from .design import require, digest

EXPORT='ai-city-spineboy-skin-v13/spine-export'
IMAGES='Chibi-Stickers-4.3/extracted/images'

def library_root(root):
    root=Path(root).resolve();private=root/'runtime/vendor-untracked/reference-library'
    # Existing installations keep working. New installations use tool-local assets.
    return private if private.exists() else root.parent/'library'

def required_files(source):
    from .template import inspect_template
    source=Path(source).resolve();folder=source/EXPORT
    skeleton=folder/'ai-city-original-template.json';atlas=folder/'ai-city-original-template.atlas'
    require(skeleton.is_file() and atlas.is_file(),'REFERENCE_SOURCE_MISSING')
    report=inspect_template(skeleton,atlas);require(not report['defects'],'REFERENCE_TEMPLATE_INVALID')
    names=[skeleton.relative_to(source).as_posix(),atlas.relative_to(source).as_posix()]
    names.extend((Path(EXPORT)/p).as_posix() for p in report['pages'])
    for skin,parts in {'spineboy':['head-base','ear','hair-front','back-hair','body','arm','leg'], 'harri':['body','arm','leg','hair-front','back-hair'], 'davide':['body','arm','leg','hair-front'], 'erikari':['skirt']}.items():
        names.extend(f'{IMAGES}/{skin}/{part}.png' for part in parts)
    for name in names:
        path=source/name
        require(not path.is_symlink() and path.resolve().is_relative_to(source) and path.is_file(),'REFERENCE_FILE_MISSING')
        require(not any(p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction()) for p in (path,*path.parents) if p.is_relative_to(source)),'REFERENCE_LINK')
    return sorted(set(names))

def inspect(root):
    folder=library_root(root);names=required_files(folder)
    return {'status':'REFERENCE_READY','files':len(names),'private':True,'redistribution_approved':False}

def import_library(root,source):
    root=Path(root).resolve();source=Path(source).resolve();names=required_files(source)
    target=root/'runtime/vendor-untracked/reference-library'
    require(not target.exists(),'REFERENCE_DESTINATION_EXISTS')
    target.parent.mkdir(parents=True,exist_ok=True)
    require(target.parent.resolve().is_relative_to(root) and not target.parent.is_symlink(),'REFERENCE_PATH')
    stage=target.with_name('.incomplete-reference-'+uuid.uuid4().hex);stage.mkdir()
    files={name:digest(source/name) for name in names}
    # On failure retain an explicitly incomplete private folder; never delete user data.
    for name in names:
        out=stage/name;out.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,out)
        require(digest(out)==files[name],'REFERENCE_COPY_CHANGED')
    require(all(digest(source/name)==h for name,h in files.items()),'REFERENCE_SOURCE_CHANGED')
    (stage/'import-manifest.json').write_text(json.dumps({'files':files,'private':True,'redistribution_approved':False},indent=2)+'\n',encoding='utf-8')
    stage.rename(target)
    return inspect(root)
