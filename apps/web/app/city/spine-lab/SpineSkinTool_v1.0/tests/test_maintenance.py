"""Private synthetic files only; never backup real photos or delete real data."""
import copy,errno,json,stat,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool.maintenance import create_archive,verify_archive,restore_archive,fingerprint
from spine_skin_tool.assembly import canonical,VERSIONS
from spine_skin_tool.design import DesignError,digest
from spine_skin_tool.acceptance import seal,report,artifact


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='spine m08 ');self.root=Path(self.temp.name)
        for name,text in {'README.md':'safe code','src/feature.py':'VALUE=1','runtime/work/task/photo.png':'SYNTHETIC_PRIVATE_SENTINEL','runtime/work/M04/generation/jobs/codex-call-0001.reserved':'job-synthetic','runtime/secrets/providers.json':'SYNTHETIC_SECRET_SENTINEL','runtime/config/local.toml':'SYNTHETIC_LOCAL_SECRET','runtime/output/prior.zip':'private old output','runtime/data/state.txt':'persistent'}.items():
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8')
        self.archive=self.root/'runtime/output/M08/test.zip';self.destination=self.root/'runtime/output/M08/restores/test'
    def tearDown(self):self.temp.cleanup()
    def malicious(self,entries):
        self.archive.parent.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(self.archive,'w') as z:
            for name,data in entries:z.writestr(name,data)
    def test_source_archive_excludes_all_private_data_and_dependencies(self):
        create_archive(self.root,self.archive);m=verify_archive(self.archive)
        self.assertEqual(set(m['files']),{'README.md','src/feature.py'});self.assertNotIn(b'SYNTHETIC_PRIVATE',self.archive.read_bytes());self.assertNotIn(b'SYNTHETIC_SECRET',self.archive.read_bytes());self.assertFalse(m['production_approved'])
    def test_archive_and_restore_hashing_never_reads_whole_files_into_memory(self):
        with patch.object(Path,'read_bytes',side_effect=AssertionError('whole-file allocation forbidden')):
            result=create_archive(self.root,self.archive);verify_archive(self.archive);restore_archive(self.root,self.archive,self.destination)
        import hashlib
        self.assertEqual(result['sha256'],hashlib.sha256(self.archive.read_bytes()).hexdigest())
    def test_only_the_pinned_nonphoto_synthetic_png_is_distributed(self):
        name='fixtures/synthetic/shared-design/character-reference.png';p=self.root/name;p.parent.mkdir(parents=True);p.write_bytes((Path(__file__).resolve().parents[1]/name).read_bytes());(p.parent/'private.png').write_bytes(b'PRIVATE_NOT_DISTRIBUTABLE')
        create_archive(self.root,self.archive);m=verify_archive(self.archive);self.assertIn(name,m['files']);self.assertNotIn(name.replace('character-reference.png','private.png'),m['files'])
        p.write_bytes(b'PRIVATE_REPLACEMENT')
        with self.assertRaisesRegex(DesignError,'SYNTHETIC_FIXTURE_CHANGED'):create_archive(self.root,self.archive.with_name('bad.zip'))
    def test_private_restore_retains_ledger_and_data_and_does_not_copy_keys(self):
        before=digest(self.root/'runtime/work/task/photo.png');create_archive(self.root,self.archive,'PRIVATE_BACKUP');m=verify_archive(self.archive);self.assertNotIn('runtime/secrets/providers.json',m['files']);restore_archive(self.root,self.archive,self.destination)
        for name in m['files']:self.assertEqual((self.root/name).read_bytes(),(self.destination/name).read_bytes())
        self.assertEqual(digest(self.root/'runtime/work/task/photo.png'),before);self.assertFalse((self.destination/'runtime/secrets').exists());self.assertTrue((self.destination/'runtime/work/M04/generation/jobs/codex-call-0001.reserved').exists())
        with self.assertRaisesRegex(DesignError,'RESTORE_NEW_DIRECTORY_REQUIRED'):restore_archive(self.root,self.archive,self.destination)
    def test_backup_does_not_recursively_include_previous_backups_or_restores(self):
        p=self.root/'runtime/output/M08/restores/old/runtime/work/old.txt';p.parent.mkdir(parents=True);p.write_text('not duplicated')
        create_archive(self.root,self.archive,'PRIVATE_BACKUP');self.assertTrue(all(not n.startswith('runtime/output/M08/') for n in verify_archive(self.archive)['files']))
    def test_hidden_and_unknown_work_files_are_preserved_and_permission_errors_fail(self):
        p=self.root/'runtime/data/.hidden-state';p.write_text('persistent hidden state')
        create_archive(self.root,self.archive,'PRIVATE_BACKUP');self.assertIn('runtime/data/.hidden-state',verify_archive(self.archive)['files'])
        from spine_skin_tool.maintenance import private_files
        with patch('os.scandir',side_effect=PermissionError('injected unreadable data')),self.assertRaises(PermissionError):private_files(self.root)
    def test_source_and_private_data_recover_together_without_keys_or_overwrite(self):
        source=self.archive.with_name('source.zip');create_archive(self.root,source);create_archive(self.root,self.archive,'PRIVATE_BACKUP');r=restore_archive(self.root,self.archive,self.destination,source)
        self.assertEqual(r['kind'],'RECOVERED_INSTALLATION');self.assertTrue((self.destination/'src/feature.py').is_file());self.assertTrue((self.destination/'runtime/data/state.txt').is_file());self.assertFalse((self.destination/'runtime/secrets').exists())
    def test_equal_version_numbers_do_not_allow_different_source_code_to_merge(self):
        source=self.archive.with_name('source.zip');create_archive(self.root,source);(self.root/'src/feature.py').write_text('VALUE=2');create_archive(self.root,self.archive,'PRIVATE_BACKUP')
        with self.assertRaisesRegex(DesignError,'RESTORE_VERSION_MISMATCH'):restore_archive(self.root,self.archive,self.destination,source)
        self.assertFalse(self.destination.exists())
    def test_windows_and_posix_traversal_and_duplicate_members_rejected(self):
        for name in ('../escape','/absolute','C:/drive','dir\\escape','CON.txt','dir/a.','a//b','a/./b'):
            with self.subTest(name=name):
                self.malicious([(name,b'bad')])
                with self.assertRaises(ValueError):verify_archive(self.archive)
                self.assertFalse(self.destination.exists())
        self.malicious([('a',b'1'),('A',b'2')])
        with self.assertRaisesRegex(DesignError,'ARCHIVE_DUPLICATE'):verify_archive(self.archive)
    def test_symlink_members_and_wrong_manifest_scope_rejected(self):
        info=zipfile.ZipInfo('link');info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16;self.malicious([(info,b'../outside')])
        with self.assertRaisesRegex(DesignError,'ARCHIVE_MEMBER_TYPE'):verify_archive(self.archive)
        name='runtime/secrets/leak.json';body=b'bad';import hashlib
        m={'schema_version':VERSIONS['product']['api_schema'],'kind':'PRIVATE_BACKUP','production_approved':False,'versions':VERSIONS,'bytes':3,'files':{name:{'size':3,'sha256':hashlib.sha256(body).hexdigest()}}}
        self.malicious([('archive-manifest.json',canonical(m)),(name,body)])
        with self.assertRaisesRegex(DesignError,'ARCHIVE_PRIVATE_SCOPE'):verify_archive(self.archive)
    def test_content_tamper_is_detected_before_restore(self):
        create_archive(self.root,self.archive);raw=self.archive.read_bytes();self.archive.write_bytes(raw.replace(b'VALUE=1',b'VALUE=2'))
        with self.assertRaises((ValueError,zipfile.BadZipFile)):restore_archive(self.root,self.archive,self.destination)
        self.assertFalse(self.destination.exists())
    def test_malformed_manifest_types_fail_before_any_restore_directory(self):
        import hashlib
        base={'schema_version':VERSIONS['product']['api_schema'],'kind':'PRIVATE_BACKUP','production_approved':False,'versions':{},'bytes':1,'files':{'runtime/data/value.txt':{'size':1,'sha256':hashlib.sha256(b'a').hexdigest()}}}
        cases=[None,[],{**base,'files':[]},{**base,'versions':[]},{**base,'bytes':True},{**base,'files':{'runtime/data/value.txt':[]}}]
        for value in cases:
            with self.subTest(value=value):
                self.malicious([('archive-manifest.json',canonical(value)),('runtime/data/value.txt',b'a')])
                with self.assertRaises(ValueError):restore_archive(self.root,self.archive,self.destination)
                self.assertFalse(self.destination.exists())
    def test_new_archive_cannot_overwrite_existing_file_or_leave_tool_scope(self):
        create_archive(self.root,self.archive)
        with self.assertRaisesRegex(DesignError,'ARCHIVE_DESTINATION'):create_archive(self.root,self.archive)
        with self.assertRaises(ValueError):create_archive(self.root,self.root/'src/wrong.zip')
    def test_source_changed_during_pack_is_not_published(self):
        original=zipfile.ZipFile.write
        def writer(z,*a,**kw):
            value=original(z,*a,**kw);(self.root/'src/feature.py').write_text('VALUE=2');return value
        with patch.object(zipfile.ZipFile,'write',autospec=True,side_effect=writer),self.assertRaisesRegex(DesignError,'ARCHIVE_SOURCE_CHANGED'):create_archive(self.root,self.archive)
        self.assertFalse(self.archive.exists())
    def test_injected_disk_full_during_pack_keeps_existing_private_files(self):
        with patch.object(zipfile.ZipFile,'write',side_effect=OSError(errno.ENOSPC,'synthetic disk full')),self.assertRaises(OSError):create_archive(self.root,self.archive)
        self.assertFalse(self.archive.exists());self.assertEqual((self.root/'runtime/data/state.txt').read_text(),'persistent')
    def test_injected_restore_disk_full_is_incomplete_and_not_merged(self):
        create_archive(self.root,self.archive,'PRIVATE_BACKUP')
        with patch('spine_skin_tool.maintenance.shutil.copyfileobj',side_effect=OSError(errno.ENOSPC,'synthetic disk full')),self.assertRaises(OSError):restore_archive(self.root,self.archive,self.destination)
        self.assertFalse(self.destination.exists());self.assertEqual(len(list(self.destination.parent.glob('.incomplete-*'))),1)
        restore_archive(self.root,self.archive,self.destination);self.assertTrue(self.destination.exists())
    def test_active_worker_blocks_snapshot_instead_of_backing_up_live_mutations(self):
        from spine_skin_tool.repair_store import lease
        identity='flow-'+'f'*32;p=self.root/'runtime/work/M07/tasks'/identity;p.mkdir(parents=True)
        with lease(self.root,identity,kind='flow'),self.assertRaisesRegex(DesignError,'REPAIR_BUSY'):create_archive(self.root,self.archive,'PRIVATE_BACKUP')
        self.assertFalse(self.archive.exists())
    def test_acceptance_never_production_and_evidence_source_change_is_stale(self):
        p=self.root/'runtime/work/M08/verified.json';p.parent.mkdir(parents=True);p.write_text('result')
        seal(self.root,'regression',{'status':'PASS','message_ja':'合成試験のみ。','facts':{'tests':1},'artifacts':[artifact(self.root,p)]})
        r=report(self.root);self.assertFalse(r['production_approved']);self.assertEqual(r['gates'][0]['status'],'PASS');self.assertTrue(any(g['status']=='NOT_VALIDATED' for g in r['gates']))
        (self.root/'src/feature.py').write_text('VALUE=2');self.assertEqual(report(self.root)['gates'][0]['status'],'STALE')
    def test_changed_evidence_cannot_keep_a_green_gate(self):
        p=self.root/'runtime/work/evidence.json';p.write_text('first');seal(self.root,'regression',{'status':'PASS','message_ja':'合成。','artifacts':[artifact(self.root,p)]});p.write_text('second')
        self.assertEqual(report(self.root)['gates'][0]['status'],'STALE')
    def test_output_archive_and_restore_receipt_are_verified_without_allowing_secrets(self):
        create_archive(self.root,self.archive);seal(self.root,'source_package',{'status':'PASS','message_ja':'開発用のみ。','artifacts':[artifact(self.root,self.archive)]})
        self.assertEqual(next(g for g in report(self.root)['gates'] if g['key']=='source_package')['status'],'PASS')
        b=self.archive.with_name('backup.zip');create_archive(self.root,b,'PRIVATE_BACKUP');restore_archive(self.root,b,self.destination)
        seal(self.root,'private_restore',{'status':'PASS','message_ja':'新規復元のみ。','artifacts':[artifact(self.root,self.destination/'RESTORE-RECEIPT.json')]})
        self.assertEqual(next(g for g in report(self.root)['gates'] if g['key']=='private_restore')['status'],'PASS')
        seal(self.root,'source_package',{'status':'PASS','message_ja':'不正。','artifacts':[artifact(self.root,self.root/'runtime/secrets/providers.json')]})
        self.assertEqual(next(g for g in report(self.root)['gates'] if g['key']=='source_package')['status'],'STALE')
