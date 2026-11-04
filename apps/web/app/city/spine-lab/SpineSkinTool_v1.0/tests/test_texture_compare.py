"""Synthetic geometry/state/security boundaries for read-only comparison."""
import copy,json,unittest
from unittest.mock import patch
from PIL import Image
import test_texture_edit as fixtures
from spine_skin_tool import texture_compare as compare,texture_edit as edit
from spine_skin_tool.design import DesignError,digest


class TextureCompareTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixtures.TextureEditTests();self.fixture.setUp();self.root=self.fixture.root;self.base=self.fixture.base;source=self.base/'export/bundle'
        skeleton={'bones':[{'name':'root'}],'slots':[{'name':'head-base'},{'name':'hair-front'},{'name':'back-hair'}],'animations':{'movement/idle-front':{'test':'unchanged'}},'skins':[{'name':'test','attachments':{'head-base':{'head-base':{'path':'original-head'}},'hair-front':{},'back-hair':{}}}]}
        (source/'skeleton.json').write_text(json.dumps(skeleton),encoding='utf-8')
        (source/'skeleton.atlas').write_text('\n'.join(f'{name}\nsize: 80, 80\nformat: RGBA8888\nregion\n  bounds: 0, 0, 80, 80\n  offsets: 0, 0, 80, 80\n' for slot,name in compare.PARTS.values()),encoding='utf-8')
        (source/'assembly-report.json').write_text('{}',encoding='utf-8')
        (source/'build-manifest.json').write_text(json.dumps({'skin':'test','parts':{},'files':{}}),encoding='utf-8')
        self.sid=self.fixture.session();self.layout={'front_width':120,'back_width':130,'top':200,'back_top':205}
        self.extra=[patch.object(compare,'verify_bundle',side_effect=lambda folder:json.loads((folder/'build-manifest.json').read_text(encoding='utf-8'))),patch('spine_skin_tool.hair_fit.validate',return_value=self.layout),patch('spine_skin_tool.design.load_design',return_value=self.fixture.record)]
        for p in self.extra:p.start()
    def tearDown(self):
        for p in self.extra:p.stop()
        self.fixture.tearDown()
    def result(self,part='HAIR_FRONT',shift=3):
        self.fixture.reserve(self.sid,part);path=self.root/'result.png';im=Image.new('RGBA',(80,80));im.paste((60,40,20,255),(10+shift,10,70+shift,70));im.save(path);edit.receive(self.root,self.sid,part,1,path)
    def test_rejected_result_visible_without_admission_or_reservation_changes(self):
        self.result();before=copy.deepcopy(edit.read(self.root,self.sid));config=compare.configuration(self.root,self.sid)
        self.assertTrue(config['comparison_only']);self.assertFalse(config['quality_approved']);self.assertEqual(config['model_calls'],0)
        self.assertEqual(config['parts']['HAIR_FRONT'][1]['old_check_status'],'GEOMETRY_CHANGED_VISUAL_REVIEW_REQUIRED')
        self.assertEqual(compare.raw_file(self.root,self.sid,'HAIR_FRONT',1).read_bytes(),(self.root/'result.png').read_bytes())
        self.assertEqual(edit.read(self.root,self.sid),before)
        self.assertNotIn('photo',json.dumps(config));self.assertNotIn(str(self.root),json.dumps(config))
    def test_whitelist_missing_results_and_tampering_fail_closed(self):
        for part,n in [('HEAD_FRONT',0),('../design',0),('HAIR_FRONT',4),('HAIR_FRONT',True),('HAIR_FRONT',1)]:
            with self.assertRaises(DesignError):compare.raw_file(self.root,self.sid,part,n)
        self.result();path=compare.raw_file(self.root,self.sid,'HAIR_FRONT',1);path.write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'TEXTURE_COMPARE_CHANGED'):compare.raw_file(self.root,self.sid,'HAIR_FRONT',1)
    def test_fixed_base_mapping_does_not_refit_shifted_result_and_keeps_rig(self):
        self.result();source=self.base/'export/bundle';original={p.name:digest(p) for p in source.iterdir()};before=copy.deepcopy(edit.read(self.root,self.sid))
        a=compare.bundle(self.root,self.sid,0,0);b=compare.bundle(self.root,self.sid,1,0)
        ja=json.loads((a/'skeleton.json').read_text());jb=json.loads((b/'skeleton.json').read_text());self.assertEqual(ja,jb)
        original_rig=json.loads((source/'skeleton.json').read_text())
        for key in ('bones','slots','animations'):self.assertEqual(jb[key],original_rig[key])
        self.assertEqual(jb['skins'][0]['attachments']['head-base'],original_rig['skins'][0]['attachments']['head-base'])
        self.assertEqual((b/compare.PARTS['HAIR_FRONT'][1]).read_bytes(),(self.root/'result.png').read_bytes())
        self.assertEqual(original,{p.name:digest(p) for p in source.iterdir()});self.assertEqual(before,edit.read(self.root,self.sid))
        manifest=json.loads((b/'build-manifest.json').read_text());self.assertTrue(manifest['comparison_only']);self.assertFalse(manifest['quality_approved']);self.assertFalse(manifest['production_approved'])
        self.assertEqual(compare.bundle(self.root,self.sid,1,0),b)
    def test_base_change_prevents_even_cached_view(self):
        compare.bundle(self.root,self.sid,0,0);(self.base/'raw/HAIR_FRONT.png').write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'TEXTURE_BASE_CHANGED'):compare.bundle(self.root,self.sid,0,0)
    def test_readonly_watch_detects_modified_display_or_source_bytes(self):
        self.result();folder=compare.bundle(self.root,self.sid,1,0);watched=compare.watch_inputs(self.root,self.sid,folder);compare.check_watched(self.root,watched)
        (folder/'skeleton.json').write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'TEXTURE_COMPARE_VIEW_CHANGED'):compare.check_watched(self.root,watched)
