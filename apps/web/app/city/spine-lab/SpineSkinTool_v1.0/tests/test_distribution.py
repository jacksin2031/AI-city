"""Release privacy and portable setup boundaries, no credentials or model calls."""
import importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool import distribution as d
from spine_skin_tool.reference_assets import library_root,import_library,verify_bundled
ROOT=Path(__file__).resolve().parents[1]

class DistributionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.cfg={'source_top':['README.md'],'source_directories':['src'],'public_docs':[],'runtime_files':[],'release_id':'synthetic','private_directories':['runtime/work','runtime/secrets'],'rebuildable_directories':['runtime/cache'],'local_history_directories':['docs/evidence']}
  (self.root/'README.md').write_text('safe');(self.root/'src').mkdir();(self.root/'src/a.py').write_text('VALUE=1')
  self.a=patch.object(d,'policy',return_value=self.cfg);self.a.start();self.b=patch.object(d,'SYNTHETIC',{});self.b.start()
 def tearDown(self):self.a.stop();self.b.stop();self.tmp.cleanup()
 def test_private_sentinels_never_enter_package_and_each_hash_matches(self):
  for name in ('runtime/secrets/providers.json','runtime/work/photo.png','runtime/output/character.spine','docs/evidence/log.md'):
   p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('PRIVATE_SENTINEL')
  output=self.root/'runtime/output/M08/test.zip';d.build(self.root,output)
  with zipfile.ZipFile(output) as z:
   self.assertEqual(set(z.namelist()),{'RELEASE-MANIFEST.json','README.md','src/a.py'})
   self.assertNotIn(b'PRIVATE_SENTINEL',b''.join(z.read(n) for n in z.namelist()))
   manifest=json.loads(z.read('RELEASE-MANIFEST.json'));self.assertFalse(manifest['credentials_included']);self.assertFalse(manifest['reference_art_included'])
  with self.assertRaisesRegex(ValueError,'RELEASE_DESTINATION'):d.build(self.root,output)
 def test_credential_content_or_misplaced_auth_file_blocks_release(self):
  for content in ['sk-proj-'+'A'*40,'ghp_'+'B'*40,'-----BEGIN '+'PRIVATE KEY-----']:
   (self.root/'src/a.py').write_text(content)
   with self.assertRaisesRegex(ValueError,'RELEASE_SECRET_PATTERN'):d.audit(self.root)
  (self.root/'src/a.py').write_text('safe');(self.root/'src/auth.json').write_text('{}')
  with self.assertRaisesRegex(ValueError,'RELEASE_PRIVATE_FILE'):d.audit(self.root)
 def test_reference_import_only_allowlisted_bytes_and_never_overwrites(self):
  source=self.root/'licensed-source';source.mkdir();(source/'a.png').write_bytes(b'ORIGINAL_REFERENCE');(source/'auth.json').write_text('PRIVATE_SENTINEL')
  with patch('spine_skin_tool.reference_assets.required_files',return_value=['a.png']):
   value=import_library(self.root,source);self.assertEqual(value['status'],'REFERENCE_READY')
   target=library_root(self.root);self.assertEqual((target/'a.png').read_bytes(),b'ORIGINAL_REFERENCE');self.assertFalse((target/'auth.json').exists())
   with self.assertRaisesRegex(ValueError,'REFERENCE_DESTINATION_EXISTS'):import_library(self.root,source)
 def test_config_initialisation_preserves_existing_budget_and_secret(self):
  spec=importlib.util.spec_from_file_location('release_config',ROOT/'scripts/configure_subscription.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  folder=self.root/'runtime/config';folder.mkdir(parents=True)
  for name in ('providers','design','review'):(folder/(name+'.example.json')).write_text(json.dumps({'live_enabled':False,'upload_consent':False,'max_live_calls':1}))
  module.configure(self.root);p=self.root/'runtime/secrets/providers.json';p.write_text(json.dumps({'live_enabled':False,'upload_consent':False,'max_live_calls':99,'api_key':'SYNTHETIC_PRIVATE'}));before=p.read_bytes()
  module.configure(self.root);self.assertEqual(before,p.read_bytes())
  module.configure(self.root,True,24);self.assertEqual(json.loads(p.read_text())['api_key'],'SYNTHETIC_PRIVATE');self.assertEqual(json.loads(p.read_text())['max_live_calls'],24)
  module.configure(self.root,True,10,preserve_existing_limits=True);self.assertEqual(json.loads(p.read_text())['max_live_calls'],24)

 def bundled(self):
  import hashlib
  folder=self.root/'references/spine';folder.mkdir(parents=True)
  files={}
  for name,body in {'Chibi-Stickers-4.3/extracted/chibi-stickers-pro.spine':b'SYNTHETIC_PROJECT','Chibi-Stickers-4.3/extracted/license.txt':b'SYNTHETIC_NONCOMMERCIAL_NOTICE','Chibi-Stickers-4.3/extracted/images/part.png':b'SYNTHETIC_PINNED_REFERENCE'}.items():
   p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(body);files[name]={'sha256':hashlib.sha256(body).hexdigest()}
  (folder/'ASSET_MANIFEST.json').write_text(json.dumps({'reference_only':True,'commercial_use_allowed':False,'files':files}));(folder/'REFERENCE_ONLY.md').write_text('reference only')
  self.cfg['reference_directory']='references/spine';return folder

 def test_bundle_is_default_and_only_pinned_images_are_distributed(self):
  folder=self.bundled();private=self.root/'runtime/vendor-untracked/reference-library';private.mkdir(parents=True)
  (folder/'Chibi-Stickers-4.3/extracted/images/private-photo.png').write_text('PRIVATE_SENTINEL')
  self.assertEqual(library_root(self.root),folder);value=d.audit(self.root);self.assertTrue(value['reference_art_included'])
  self.assertNotIn('references/spine/Chibi-Stickers-4.3/extracted/images/private-photo.png',value['files']);self.assertIn('references/spine/Chibi-Stickers-4.3/extracted/chibi-stickers-pro.spine',value['files'])

 def test_bundle_tamper_or_missing_license_rejects_instead_of_falling_back(self):
  folder=self.bundled();p=folder/'Chibi-Stickers-4.3/extracted/images/part.png';p.write_bytes(b'CHANGED')
  with self.assertRaisesRegex(ValueError,'REFERENCE_ASSET_CHANGED'):d.audit(self.root)
  m=folder/'ASSET_MANIFEST.json';v=json.loads(m.read_text());del v['files']['Chibi-Stickers-4.3/extracted/license.txt'];m.write_text(json.dumps(v))
  with self.assertRaisesRegex(ValueError,'REFERENCE_LICENSE_MISSING'):library_root(self.root)

 def test_bundle_manifest_cannot_point_at_private_paths(self):
  folder=self.bundled();m=folder/'ASSET_MANIFEST.json';v=json.loads(m.read_text());v['files']['../../runtime/secrets/auth.json']={'sha256':'0'*64};m.write_text(json.dumps(v))
  with self.assertRaisesRegex(ValueError,'REFERENCE_MANIFEST_PATH'):verify_bundled(self.root)

 def test_maintenance_source_archive_accepts_pinned_references_with_license(self):
  from spine_skin_tool.maintenance import create_archive,verify_archive
  self.bundled();(self.root/'DISTRIBUTION.json').write_text(json.dumps(self.cfg));output=self.root/'runtime/output/M08/bundled.zip'
  create_archive(self.root,output);value=verify_archive(output);self.assertIn('references/spine/Chibi-Stickers-4.3/extracted/license.txt',value['files']);self.assertEqual(value['privacy'],'SOURCE_WITH_LICENSED_NONCOMMERCIAL_REFERENCES_NO_PRIVATE_PHOTOS_KEYS_OR_DEPENDENCIES')

 def test_launcher_check_only_never_enables_settings_or_calls_a_model(self):
  import contextlib,io,sys
  spec=importlib.util.spec_from_file_location('reference_launcher',ROOT/'scripts/launch.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  with patch.object(module,'ROOT',self.root),patch.object(sys,'argv',['launch.py','--check-only']),patch('spine_skin_tool.environment.venv_python',return_value=Path(sys.executable)),patch('spine_skin_tool.reference_assets.inspect',return_value={'source':'BUNDLED'}),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch.object(module.subprocess,'call',side_effect=AssertionError('must not launch subprocess/model')),contextlib.redirect_stdout(io.StringIO()):
   self.assertEqual(module.main(),0)
  self.assertFalse((self.root/'runtime/secrets').exists())
