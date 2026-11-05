"""Evidence-bound M08 status, never a production or visual approval mechanism."""
import json,hashlib
from pathlib import Path
from .assembly import canonical
from .design import private_path,require,digest
from .pipeline_store import atomic
from .maintenance import fingerprint,safe

LABELS={
 'regression':'コード・故障境界の回帰','equivalence':'固定素材・倍率1/2/4の実再生',
 'source_package':'個人データを除く開発用ソースZIP','private_restore':'私用バックアップ・新規フォルダー復元',
 'blind_photos':'未調整の写真による全身盲検','clean_windows':'別のクリーンWindowsでの導入・削除',
 'physical_faults':'実環境での電源・ディスク・接続障害','license':'原素材の再配布許諾',
 'dimensions':'本番サイズのユーザー承認','m07_quality':'M07の全身品質と前提条件'}


def attest(root,key,evidence,statement,human_confirmed=False):
    require(human_confirmed is True and key in set(LABELS)-{'regression','equivalence','source_package','private_restore'},'ATTESTATION_HUMAN_SCOPE')
    require(isinstance(statement,str) and 1<=len(statement)<=1000,'ATTESTATION_STATEMENT')
    p=safe(root,Path(root)/evidence);require(p.is_relative_to(Path(root)/'runtime/work/M08') or p.is_relative_to(Path(root)/'runtime/output/M08'),'ATTESTATION_EVIDENCE_SCOPE')
    value={'source':'EXPLICIT_LOCAL_HUMAN_OPERATOR','source_fingerprint':fingerprint(root),'key':key,'statement':statement,'artifact':artifact(root,p),'production_approved':False}
    directory=private_path(root,'runtime/work/M08/attestations');directory.mkdir(parents=True,exist_ok=True)
    path=private_path(root,(directory/(key+'-'+hashlib.sha256(canonical(value)).hexdigest()+'.json')).relative_to(root).as_posix())
    if path.exists():require(path.read_bytes()==canonical(value)+b'\n','ATTESTATION_CONFLICT')
    else:atomic(path,value)
    return {'recorded':key,'status':'USER_ATTESTED','production_approved':False}


def seal(root,name,data):
    require(name in ('regression','equivalence','source_package','private_restore'),'ACCEPTANCE_EVIDENCE_KIND')
    value={**data,'source_fingerprint':fingerprint(root)}
    directory=private_path(root,'runtime/work/M08/evidence');directory.mkdir(parents=True,exist_ok=True)
    path=directory/(name+'.json');atomic(path,value);return path


def report(root):
    pin=fingerprint(root);rows=[]
    for key,label in LABELS.items():
        row={'key':key,'label_ja':label,'status':'NOT_VALIDATED','message_ja':'未検証です。合格として数えていません。'}
        path=private_path(root,'runtime/work/M08/evidence/'+key+'.json')
        if path.is_file() and key in ('regression','equivalence','source_package','private_restore'):
            try:
                v=json.loads(path.read_text(encoding='utf-8'));require(v['source_fingerprint']==pin,'ACCEPTANCE_STALE')
                for item in v['artifacts']:
                    p=safe(root,Path(root)/item['path'])
                    require(p.is_relative_to(Path(root)/'runtime/work') or p.is_relative_to(Path(root)/'runtime/output/M08'),'ACCEPTANCE_ARTIFACT_SCOPE')
                    require(digest(p)==item['sha256'],'ACCEPTANCE_ARTIFACT_CHANGED')
                require(v['status'] in ('PASS','FAIL','PARTIAL'),'ACCEPTANCE_RESULT')
                row.update(status=v['status'],message_ja=v['message_ja'],facts=v.get('facts',{}))
            except (ValueError,OSError,KeyError,TypeError):row.update(status='STALE',message_ja='コードまたは証拠が変更されたため、再検証が必要です。')
        rows.append(row)
    from .blind_trials import catalogue
    blind=catalogue(root)
    if blind:
        rows[4].update(status='PARTIAL',message_ja='登録された未調整写真の実行記録があります。最終正誤評価・必要な多様性は未確定です。',facts={'batches':len(blind),'completed_cases':sum(x['completed_cases'] for x in blind)})
    for row in rows:
        directory=private_path(root,'runtime/work/M08/attestations');records=list(directory.glob(row['key']+'-*.json'));valid=0;stale=0
        for p in records:
            try:
                p=private_path(root,p.relative_to(root).as_posix());v=json.loads(p.read_text(encoding='utf-8'));require(v['source']=='EXPLICIT_LOCAL_HUMAN_OPERATOR' and v['key']==row['key'] and v['source_fingerprint']==pin,'ATTESTATION_CHANGED')
                a=safe(root,Path(root)/v['artifact']['path']);require(a.is_relative_to(Path(root)/'runtime/work/M08') or a.is_relative_to(Path(root)/'runtime/output/M08'),'ATTESTATION_EVIDENCE_SCOPE');require(digest(a)==v['artifact']['sha256'],'ATTESTATION_CHANGED');valid+=1
            except (ValueError,OSError,KeyError,TypeError):stale+=1
        if valid:row.update(status='USER_ATTESTED',message_ja='ユーザーの根拠ファイルと申告が固定されています。機械の独立検証PASSや本番配布承認とは区別します。',user_records=valid,stale_records=stale)
        elif records:row.update(status='STALE',message_ja='申告または根拠が変更されたため再確認が必要です。')
    return {'status':'PARTIAL','production_approved':False,'source_fingerprint':pin,'gates':rows,'blind_batches':blind,
            'message_ja':'M08の開発・検証状況です。本番配布の門は閉じています。未検証を合格へ変換しません。'}


def artifact(root,path):
    path=Path(path);return {'path':path.relative_to(root).as_posix(),'sha256':digest(path)}
