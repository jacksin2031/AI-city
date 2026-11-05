"""Synthetic texture-only boundary tests. No real photos, model or image edits."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool import texture_edit as edit
from spine_skin_tool.design import DesignError


class TextureEditTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.output='runtime/work/synthetic';self.base=self.root/self.output
        (self.base/'raw').mkdir(parents=True);(self.base/'export/bundle').mkdir(parents=True);(self.root/'runtime/work/M04').mkdir()
        self.record={'design_id':'synthetic','design':{'photo':{'file':'character-reference.png'}}}
        (self.base/'design.json').write_text(json.dumps(self.record),encoding='utf-8')
        flow={'inputs':{p:{'kind':'GENERATED_JOB','job_id':'synthetic'} for p in ('HAIR_FRONT','HAIR_BACK')}}
        for name,value in [('flow-manifest.json',flow),('build-manifest.json',{}),('hair-fit.json',{})]:(self.base/'export/bundle'/name).write_text(json.dumps(value),encoding='utf-8')
        Image.new('RGBA',(8,12),'#667788').save(self.root/'runtime/work/M04/character-reference.png')
        im=Image.new('RGBA',(80,80));im.paste((41,37,31,255),(10,10,70,70))
        for part in ('HAIR_FRONT','HAIR_BACK'):im.save(self.base/'raw'/(part+'.png'))
        self.patches=[patch.object(edit,'verify_bundle',return_value={}),patch.object(edit,'load_design',return_value=self.record),patch('spine_skin_tool.character_flow.bindings_from_source',return_value=({},None))]
        for p in self.patches:p.start()
    def tearDown(self):
        for p in self.patches:p.stop()
        self.temp.cleanup()
    def session(self):return edit.create(self.root,self.output,['HAIR_FRONT','HAIR_BACK'])['id']
    def reserve(self,sid,part='HAIR_FRONT'):return edit.reserve(self.root,sid,part,'Simplify interior shading only.')
    def test_three_reservations_count_unknown_and_new_session_cannot_reset(self):
        sid=self.session();base=(self.base/'raw/HAIR_FRONT.png').read_bytes();paths=[]
        for n in range(1,4):
            r=self.reserve(sid);paths.append(r['reference_paths'][1]);self.assertEqual(r['attempt']['asset_attempt_number'],n);self.assertIn('NOT pixel locks',r['prompt'])
        self.assertEqual(len(set(paths)),1)
        for identity in (sid,self.session()):
            with self.assertRaisesRegex(DesignError,'TEXTURE_THREE_ATTEMPTS_REACHED'):self.reserve(identity)
        self.assertEqual((self.base/'raw/HAIR_FRONT.png').read_bytes(),base)
    def test_cross_session_shared_slots_never_allow_fourth_request(self):
        a,b=self.session(),self.session();self.assertEqual(self.reserve(a)['attempt']['asset_attempt_number'],1);self.assertEqual(self.reserve(b)['attempt']['asset_attempt_number'],2);self.assertEqual(self.reserve(a)['attempt']['asset_attempt_number'],3)
        with self.assertRaisesRegex(DesignError,'TEXTURE_THREE_ATTEMPTS_REACHED'):self.reserve(b)
    def test_changed_source_stops_before_a_new_reservation(self):
        sid=self.session();(self.base/'raw/HAIR_FRONT.png').write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'TEXTURE_BASE_CHANGED'):self.reserve(sid)
        self.assertEqual(edit.read(self.root,sid)['attempts'],[])
    def test_rgb_only_change_is_geometry_checked_but_never_art_approved(self):
        sid=self.session();self.reserve(sid);before=(self.base/'raw/HAIR_FRONT.png').read_bytes();im=Image.new('RGBA',(80,80));im.paste((25,21,17,255),(10,10,70,70));path=self.root/'return.png';im.save(path)
        s=edit.receive(self.root,sid,'HAIR_FRONT',1,path);a=s['attempts'][0];self.assertEqual(a['status'],'GEOMETRY_CHANGED_VISUAL_REVIEW_REQUIRED');self.assertTrue(a['metrics']['alpha_bytes_unchanged']);self.assertFalse(s['quality_approved']);self.assertFalse(a['quality_approved'])
        self.assertEqual((edit.directory(self.root,sid)/'HAIR_FRONT-1/result.png').read_bytes(),path.read_bytes());self.assertEqual((self.base/'raw/HAIR_FRONT.png').read_bytes(),before)
    def test_shift_and_canvas_changes_require_visual_review_invalid_mode_rejected(self):
        sid=self.session()
        for n in range(1,4):
            self.reserve(sid);path=self.root/f'return-{n}.png'
            if n==1:
                im=Image.new('RGBA',(80,80));im.paste((41,37,31,255),(13,10,73,70))
            elif n==2:
                im=Image.new('RGBA',(90,80));im.paste((41,37,31,255),(10,10,70,70))
            else:im=Image.new('RGB',(80,80))
            im.save(path);s=edit.receive(self.root,sid,'HAIR_FRONT',n,path)
            self.assertEqual(s['attempts'][-1]['status'],'REJECTED_INVALID_RESULT' if n==3 else 'GEOMETRY_CHANGED_VISUAL_REVIEW_REQUIRED');self.assertFalse(s['quality_approved'])
    def test_blank_or_opaque_image_is_not_admitted_when_outline_lock_is_removed(self):
        sid=self.session()
        for n,color in enumerate(((0,0,0,0),(41,37,31,255)),1):
            self.reserve(sid);path=self.root/f'bad-{n}.png';Image.new('RGBA',(80,80),color).save(path)
            s=edit.receive(self.root,sid,'HAIR_FRONT',n,path)
            self.assertEqual(s['attempts'][-1]['status'],'REJECTED_INVALID_RESULT');self.assertEqual(s['attempts'][-1]['metrics']['code'],'TEXTURE_CONTENT_REQUIRED')
    def test_request_mutation_is_not_accepted_as_the_same_edit(self):
        sid=self.session();self.reserve(sid);(edit.directory(self.root,sid)/'HAIR_FRONT-1/prompt.txt').write_text('change geometry',encoding='utf-8')
        with self.assertRaisesRegex(DesignError,'TEXTURE_REQUEST_CHANGED'):edit.receive(self.root,sid,'HAIR_FRONT',1,self.base/'raw/HAIR_FRONT.png')
    def test_frozen_rules_and_policy_revision_cannot_drift_between_attempts(self):
        sid=self.session();original_digest=edit.digest
        with patch.object(edit,'digest',side_effect=lambda p:'0'*64 if str(p).replace('\\','/').endswith('/docs/QUALITY.md') else original_digest(p)):
            with self.assertRaisesRegex(DesignError,'TEXTURE_NORM_CHANGED'):self.reserve(sid)
        with patch.dict(edit.VERSIONS['workflow'],{'texture_edit_revision':'synthetic-future'}):
            with self.assertRaisesRegex(DesignError,'TEXTURE_POLICY_CHANGED'):self.reserve(sid)
        self.assertEqual(edit.read(self.root,sid)['attempts'],[])
    def test_unverified_import_cannot_become_a_new_edit_base(self):
        path=self.base/'export/bundle/flow-manifest.json';flow=json.loads(path.read_text(encoding='utf-8'));flow['inputs']['HAIR_FRONT']['kind']='IMPORTED_IMAGE_ORIGIN_UNVERIFIED';path.write_text(json.dumps(flow),encoding='utf-8')
        with self.assertRaisesRegex(DesignError,'TEXTURE_ORIGINAL_GENERATED_BASE_REQUIRED'):self.session()
