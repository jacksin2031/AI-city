"""Local source packages and PRIVATE snapshots. Never upload, merge or delete data."""
import contextlib,hashlib,json,os,re,shutil,stat,uuid,zipfile
from pathlib import Path,PurePosixPath
from .assembly import canonical,VERSIONS
from .design import require

SOURCE_DIRS=('src','ui','scripts','tests','schemas','prompts','templates','fixtures','docs')
SOURCE_TOP=('AGENTS.md','README.md','.gitignore','.gitattributes')
CONTRACTS=('runtime/versions.toml','runtime/README.md','runtime/license-manifest.json','runtime/python/pyproject.toml','runtime/python/uv.lock','runtime/js/package.json','runtime/js/pnpm-lock.yaml','runtime/js/.npmrc')
CONFIGS=('defaults.toml','size-trials.toml','quality-policy.json','review-criteria.json','calibration.example.json','design.example.json','local.example.toml','providers.example.json','repair.example.json','review.example.json')
SYNTHETIC_ASSETS={'fixtures/synthetic/shared-design/character-reference.png':'07eb2275e52cd6d97e2b93101c2d330465d40a57f25959fbfc1574dbc46a772b'}
EXTENSIONS={'.py','.js','.cjs','.html','.css','.json','.toml','.yaml','.yml','.md','.txt','.sql'}
MAX_FILES=150000
MAX_TOTAL=64*1024**3


def digest(path):
    # Archives can be many GiB. Keep hashing bounded; the legacy template helper
    # reads its entire (normally small) image into memory and is unsuitable here.
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()


def safe(root,path):
    root=Path(root).absolute();path=Path(path).absolute()
    require(path.is_relative_to(root),'MAINTENANCE_PATH')
    for p in (root,*[root.joinpath(*path.relative_to(root).parts[:i]) for i in range(1,len(path.relative_to(root).parts)+1)]):
        require(not p.is_symlink() and not (hasattr(p,'is_junction') and p.is_junction()),'MAINTENANCE_LINK')
    require(path.resolve().is_relative_to(root.resolve()),'MAINTENANCE_PATH');return path


def source_files(root):
    if (Path(root)/'DISTRIBUTION.json').is_file():
        from .distribution import release_files
        return release_files(root)
    root=Path(root);files=[]
    for name in (*SOURCE_TOP,*CONTRACTS,*('runtime/config/'+n for n in CONFIGS),*SYNTHETIC_ASSETS):
        p=safe(root,root/name)
        if name in SYNTHETIC_ASSETS:
            if (root/'src/spine_skin_tool/design.py').is_file():require(p.is_file(),'SYNTHETIC_FIXTURE_MISSING')
            if p.is_file():require(digest(p)==SYNTHETIC_ASSETS[name],'SYNTHETIC_FIXTURE_CHANGED')
        if p.is_file():files.append(p)
    for name in SOURCE_DIRS:
        base=safe(root,root/name)
        if not base.exists():continue
        for p in base.rglob('*'):
            safe(root,p)
            rel=p.relative_to(root).as_posix()
            if p.is_file() and p.suffix in EXTENSIONS and '__pycache__' not in p.parts and not rel.startswith(('docs/changes/','docs/plans/','docs/evidence/')):files.append(p)
    return sorted(files)


def private_files(root):
    root=Path(root);files=[]
    def scan_error(error):raise error  # An unreadable directory is not an empty directory.
    for name in ('runtime/work','runtime/data','runtime/output'):
        base=safe(root,root/name)
        if not base.exists():continue
        for current,dirs,names in os.walk(base,followlinks=False,onerror=scan_error):
            current=Path(current)
            dirs[:]=[n for n in dirs if not (current==root/'runtime/output' and n.casefold()=='m08')]
            for n in dirs:safe(root,current/n)
            for n in names:
                p=safe(root,current/n)
                if p.is_file() and p.name not in ('worker.lock','decision.lock','worker.lock.owner.json','decision.lock.owner.json'):files.append(p)
    return sorted(files)


def inventory(root,files):
    require(len(files)<=MAX_FILES,'ARCHIVE_FILE_LIMIT');result={}
    for p in files:
        safe(root,p);size=p.stat().st_size;require(size<=MAX_TOTAL,'ARCHIVE_SIZE_LIMIT')
        result[p.relative_to(root).as_posix()]={'size':size,'sha256':digest(p)}
    require(sum(x['size'] for x in result.values())<=MAX_TOTAL,'ARCHIVE_SIZE_LIMIT');return result


def fingerprint(root):
    # Operational docs/log entries are excluded; executable contracts and user
    # texture rules are pinned. Updating this README cannot fake a test pass.
    files=[p for p in source_files(root) if not p.relative_to(root).as_posix().startswith('docs/')]
    files.extend(Path(root)/n for n in ('docs/QUALITY.md','docs/TEXTURE_CONSTRUCTION_BASELINE.md') if (Path(root)/n).is_file())
    return hashlib.sha256(canonical(inventory(root,sorted(set(files))))).hexdigest()


@contextlib.contextmanager
def quiescent(root):
    from .repair_store import lease
    with contextlib.ExitStack() as stack:
        for kind,area in (('repair','M06/tasks'),('flow','M07/tasks'),('texture','M07/texture-edits')):
            folder=Path(root)/'runtime/work'/area
            if not folder.exists():continue
            for p in sorted(folder.iterdir()):
                safe(root,p)
                if p.is_dir() and re.fullmatch(kind+r'-[a-f0-9]{32}',p.name):
                    stack.enter_context(lease(root,p.name,kind=kind));stack.enter_context(lease(root,p.name,'decision.lock',kind=kind))
        yield


def create_archive(root,destination,kind='SOURCE'):
    require(kind in ('SOURCE','PRIVATE_BACKUP'),'ARCHIVE_KIND');root=Path(root).absolute()
    destination=safe(root,Path(destination) if Path(destination).is_absolute() else root/destination)
    require(destination.is_relative_to(root/'runtime/output/M08') and destination.suffix=='.zip' and not destination.exists(),'ARCHIVE_DESTINATION')
    select=source_files if kind=='SOURCE' else private_files
    with quiescent(root) if kind=='PRIVATE_BACKUP' else contextlib.nullcontext():
        files=select(root);before=inventory(root,files);total=sum(x['size'] for x in before.values())
        require(shutil.disk_usage(root).free>total+64*1024**2,'ARCHIVE_DISK_SPACE')
        manifest={'schema_version':VERSIONS['product']['api_schema'],'kind':kind,'production_approved':False,'versions':VERSIONS,'source_fingerprint':fingerprint(root),
                  'files':before,'bytes':total,'privacy':'PRIVATE_PHOTOS_AND_TASKS_DO_NOT_SHARE' if kind=='PRIVATE_BACKUP' else 'SOURCE_WITH_LICENSED_NONCOMMERCIAL_REFERENCES_NO_PRIVATE_PHOTOS_KEYS_OR_DEPENDENCIES' if any(n.startswith('references/spine/') for n in before) else 'SOURCE_ONLY_NO_PHOTOS_KEYS_DEPENDENCIES_OR_REFERENCE_ART'}
        destination.parent.mkdir(parents=True,exist_ok=True);temp=destination.with_name('.'+uuid.uuid4().hex+'.tmp')
        try:
            with zipfile.ZipFile(temp,'x',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
                z.writestr('archive-manifest.json',canonical(manifest))
                for name in before:z.write(safe(root,root/name),name)
            require(inventory(root,select(root))==before,'ARCHIVE_SOURCE_CHANGED')
            with temp.open('r+b') as f:os.fsync(f.fileno())
            os.link(temp,destination)  # Atomic no-overwrite publication on this filesystem.
        finally:temp.unlink(missing_ok=True)
    return {'kind':kind,'files':len(before),'bytes':total,'sha256':digest(destination),'production_approved':False}


def member_name(name):
    require(isinstance(name,str) and name and '\\' not in name and ':' not in name and '\x00' not in name,'ARCHIVE_MEMBER_PATH')
    p=PurePosixPath(name);require(not p.is_absolute() and p.as_posix()==name,'ARCHIVE_MEMBER_PATH')
    for part in p.parts:
        require(part not in ('.','..') and part.rstrip(' .')==part and not re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?',part,re.I),'ARCHIVE_MEMBER_PATH')
    return name


def verify_archive(path):
    with zipfile.ZipFile(path) as z:
        infos=z.infolist();require(len(infos)<=MAX_FILES+1,'ARCHIVE_FILE_LIMIT')
        names=[member_name(i.filename) for i in infos];require(len({n.casefold() for n in names})==len(names),'ARCHIVE_DUPLICATE')
        require(sum(i.file_size for i in infos)<=MAX_TOTAL+32*1024**2,'ARCHIVE_SIZE_LIMIT')
        require(all(not i.is_dir() and stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG) and not i.flag_bits&1 for i in infos),'ARCHIVE_MEMBER_TYPE')
        require('archive-manifest.json' in names and z.getinfo('archive-manifest.json').file_size<=32*1024**2,'ARCHIVE_MANIFEST')
        m=json.loads(z.read('archive-manifest.json'))
        require(isinstance(m,dict) and {'schema_version','kind','production_approved','versions','files','bytes'}<=set(m),'ARCHIVE_MANIFEST')
        require(m['schema_version']==VERSIONS['product']['api_schema'] and m['kind'] in ('SOURCE','PRIVATE_BACKUP') and m['production_approved'] is False,'ARCHIVE_MANIFEST')
        require(isinstance(m['files'],dict) and isinstance(m['versions'],dict) and type(m['bytes']) is int and 0<=m['bytes']<=MAX_TOTAL,'ARCHIVE_MANIFEST')
        require(set(names)=={'archive-manifest.json',*m['files']},'ARCHIVE_CONTENTS')
        reference_members=set()
        ref_name='references/spine/ASSET_MANIFEST.json'
        if m['kind']=='SOURCE' and any(n.startswith('references/spine/') for n in m['files']):
            require(ref_name in m['files'] and z.getinfo(ref_name).file_size<=2*1024**2,'ARCHIVE_REFERENCE_MANIFEST')
            ref=json.loads(z.read(ref_name))
            require(ref.get('reference_only') is True and ref.get('commercial_use_allowed') is False and isinstance(ref.get('files'),dict),'ARCHIVE_REFERENCE_MANIFEST')
            require('Chibi-Stickers-4.3/extracted/license.txt' in ref['files'] and 'Chibi-Stickers-4.3/extracted/chibi-stickers-pro.spine' in ref['files'],'ARCHIVE_REFERENCE_LICENSE')
            reference_members={ref_name,'references/spine/REFERENCE_ONLY.md'}
            for name,item in ref['files'].items():
                member_name(name);require(name.split('/')[0] in ('Chibi-Stickers-4.3','ai-city-spineboy-skin-v13') and PurePosixPath(name).suffix in ('.png','.spine','.skel','.atlas','.json','.txt'),'ARCHIVE_REFERENCE_SCOPE')
                full='references/spine/'+name;require(full in m['files'] and item.get('sha256')==m['files'][full].get('sha256'),'ARCHIVE_REFERENCE_HASH');reference_members.add(full)
        for name,item in m['files'].items():
            require(isinstance(item,dict) and set(item)=={'size','sha256'} and type(item['size']) is int and item['size']>=0 and isinstance(item['sha256'],str) and re.fullmatch(r'[a-f0-9]{64}',item['sha256']),'ARCHIVE_FILE_DESCRIPTOR')
            if m['kind']=='PRIVATE_BACKUP':require(name.startswith(('runtime/work/','runtime/data/','runtime/output/')) and not name.startswith('runtime/output/M08/'),'ARCHIVE_PRIVATE_SCOPE')
            else:require(name in (*SOURCE_TOP,'使用说明.md','文件分类与发布说明.md','DISTRIBUTION.json','启动工具.cmd') or name in reference_members or name in CONTRACTS or name in {'runtime/config/'+n for n in CONFIGS} or (name in SYNTHETIC_ASSETS and item['sha256']==SYNTHETIC_ASSETS[name]) or (name.split('/')[0] in SOURCE_DIRS and PurePosixPath(name).suffix in EXTENSIONS),'ARCHIVE_SOURCE_SCOPE')
            require(type(item['size']) is int and item['size']==z.getinfo(name).file_size,'ARCHIVE_FILE_SIZE')
            h=hashlib.sha256()
            with z.open(name) as f:
                while chunk:=f.read(1024*1024):h.update(chunk)
            require(h.hexdigest()==item['sha256'],'ARCHIVE_FILE_CHANGED')
        require(m['bytes']==sum(x['size'] for x in m['files'].values()),'ARCHIVE_TOTAL')
        return m


def restore_archive(root,archive,destination,source_archive=None):
    root=Path(root).absolute();archive=safe(root,Path(archive) if Path(archive).is_absolute() else root/archive)
    destination=safe(root,Path(destination) if Path(destination).is_absolute() else root/destination)
    require(destination.is_relative_to(root/'runtime/output/M08/restores') and destination!=root/'runtime/output/M08/restores' and not destination.exists(),'RESTORE_NEW_DIRECTORY_REQUIRED')
    m=verify_archive(archive);archives=[(archive,m)]
    if source_archive is not None:
        source=safe(root,Path(source_archive) if Path(source_archive).is_absolute() else root/source_archive);sm=verify_archive(source)
        require(m['kind']=='PRIVATE_BACKUP' and sm['kind']=='SOURCE' and not set(m['files'])&set(sm['files']),'RESTORE_PACKAGE_PAIR')
        require(m['versions']==sm['versions'] and m.get('source_fingerprint') and m['source_fingerprint']==sm.get('source_fingerprint'),'RESTORE_VERSION_MISMATCH');archives.append((source,sm))
    require(shutil.disk_usage(root).free>sum(v['bytes'] for _,v in archives)+64*1024**2,'ARCHIVE_DISK_SPACE')
    destination.parent.mkdir(parents=True,exist_ok=True);stage=destination.with_name('.incomplete-'+uuid.uuid4().hex);stage.mkdir()
    # On failure retain this explicitly incomplete new folder for inspection;
    # never recursively delete existing user data and never merge a retry.
    (stage/'INCOMPLETE').write_text('NOT_RESTORED',encoding='utf-8')
    for file,value in archives:
        with zipfile.ZipFile(file) as z:
            for name,item in value['files'].items():
                out=safe(stage,stage/name);out.parent.mkdir(parents=True,exist_ok=True)
                with z.open(name) as src,out.open('xb') as dst:shutil.copyfileobj(src,dst,1024*1024);dst.flush();os.fsync(dst.fileno())
                require(digest(out)==item['sha256'],'RESTORE_FILE_CHANGED')
    count=sum(len(v['files']) for _,v in archives);kind='RECOVERED_INSTALLATION' if source_archive else m['kind']
    (stage/'RESTORE-RECEIPT.json').write_bytes(canonical({'kind':kind,'files':count,'archive_sha256':[digest(f) for f,_ in archives],'credentials_restored':False,'live_resume_allowed':False}))
    (stage/'INCOMPLETE').unlink();require(not destination.exists(),'RESTORE_NEW_DIRECTORY_REQUIRED');stage.rename(destination)
    return {'kind':kind,'files':count,'verified':True,'credentials_restored':False,'live_resume_allowed':False}
