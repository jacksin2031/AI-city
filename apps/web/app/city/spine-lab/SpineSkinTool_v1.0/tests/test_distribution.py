"""Release privacy and portable setup boundaries, no credentials or model calls."""
import importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool import distribution as d
from spine_skin_tool.reference_assets import library_root,import_library
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
