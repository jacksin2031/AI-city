"""Real bundle integrity defects on synthetic inputs, never real photos or cloud calls."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool.design import ROOT,draft_design,freeze_design,digest,DesignError
from spine_skin_tool.mother import prepare
from spine_skin_tool.assembly import make_profile,canonical
from spine_skin_tool.character_service import dispatch
from spine_skin_tool.review import create_review,read_review,hard_checks


class ReviewIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='spine QA bundle ');self.root=Path(self.tmp.name)
        photo=self.root/'runtime/work/M04';photo.mkdir(parents=True);Image.new('RGBA',(24,32),(80,90,100,255)).save(photo/'character-reference.png')
        self.source,self.atlas,self.inputs,self.profile=prepare(ROOT);profile=make_profile(self.source,self.atlas)
        self.mother=patch('spine_skin_tool.character.prepare',return_value=(self.source,self.atlas,self.inputs,self.profile));self.mother.start()
        self.source_mock=patch('spine_skin_tool.character_flow.source_profile',return_value=(self.source,self.atlas,profile));self.source_mock.start()
        record=freeze_design(self.root,draft_design(self.root,'character-reference.png','synthetic-review'))
        raw=self.root/'runtime/work/raw';raw.mkdir()
        for part in ('HAIR_FRONT','HAIR_BACK','BODY_FRONT','BODY_BACK','LEG_FRONT','LEG_BACK'):
            im=Image.new('RGBA',(100,160));im.paste((53,51,61,255),(2,2,98,158));im.save(raw/(part+'.png'))
        self.output='runtime/work/character';dispatch('assemble',{'design_id':record['design_id'],'raw_directory':'runtime/work/raw','output':self.output},self.root)
        self.bundle=self.root/self.output/'export/bundle'
    def tearDown(self):self.source_mock.stop();self.mother.stop();self.tmp.cleanup()
    def update_manifest(self,file):
        path=self.bundle/'build-manifest.json';manifest=json.loads(path.read_text(encoding='utf-8'));manifest['files'][file]=digest(self.bundle/file);path.write_bytes(canonical(manifest)+b'\n')

    def test_hard_pass_still_requires_review_and_source_change_invalidates(self):
        result=create_review(self.root,self.output);self.assertEqual(result['hard']['status'],'PASS');self.assertEqual(result['status'],'REQUIRES_REVIEW')
        raw=self.root/self.output/'raw/HAIR_FRONT.png';raw.write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'REVIEW_STALE_SOURCE'):read_review(self.root,result['review_id'])

    def test_review_reference_sheet_includes_original_hair_and_skirt_with_bound_sources(self):
        from spine_skin_tool.review_render import make_reference_sheet
        folder=self.root/'runtime/work/review-refs';folder.mkdir();record=json.loads((self.root/self.output/'design.json').read_text(encoding='utf-8'))
        make_reference_sheet(folder,record['design'],self.root)
        with Image.open(folder/'original-references.png') as image:self.assertEqual(image.size,(800,1200))
        data=json.loads((folder/'reference-sources.json').read_text(encoding='utf-8'));self.assertFalse(data['generator_input']);sources={s['source']:s for s in data['sources']}
        from spine_skin_tool.reference_assets import library_root
        for source in ('harri/hair-front.png','harri/back-hair.png','davide/hair-front.png','spineboy/hair-front.png','erikari/skirt.png'):
            self.assertEqual(sources[source]['role'],'original_style_review_only');self.assertEqual(sources[source]['sha256'],digest(library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images'/source))

    def test_self_consistent_but_modified_rig_is_rejected(self):
        path=self.bundle/'skeleton.json';data=json.loads(path.read_text(encoding='utf-8'));data['bones'][0]['x']=999;path.write_bytes(canonical(data)+b'\n');self.update_manifest('skeleton.json')
        hard,_,_=hard_checks(self.root,self.output);self.assertEqual(hard['status'],'FAIL');self.assertIn('FIXED_RIG_CHANGED',[i['code'] for i in hard['defects']])

    def test_self_consistent_erased_arm_outline_is_rejected(self):
        path=self.bundle/'ai-city-template-arm.png'
        with Image.open(path) as raw:im=raw.convert('RGBA')
        im.putpixel((6,100),(255,211,191,255));im.save(path);self.update_manifest(path.name)
        hard,_,_=hard_checks(self.root,self.output);self.assertEqual(hard['status'],'FAIL');self.assertIn('STANDARD_ARM_OUTLINE_OR_PALETTE',[i['code'] for i in hard['defects']])

    def test_self_consistent_wrong_export_canvas_is_rejected(self):
        path=self.bundle/'ai-city-template-body.png'
        with Image.open(path) as raw:im=raw.convert('RGBA')
        im.resize((im.width+1,im.height)).save(path);self.update_manifest(path.name)
        hard,_,_=hard_checks(self.root,self.output)
        self.assertIn('NORMALIZED_PART_MISMATCH',[i['code'] for i in hard['defects']]);self.assertEqual(hard['status'],'FAIL')

    def test_tiny_raw_alpha_outliers_are_cleared_only_when_normalization_is_proven(self):
        raw=self.root/self.output/'raw/HAIR_FRONT.png'
        with Image.open(raw) as source:content=source.convert('RGBA')
        im=Image.new('RGBA',(content.width*2,content.height*2));im.paste(content,(content.width//2,content.height//2))
        im.putpixel((0,0),(1,1,1,1));im.save(raw)
        hard,_,_=hard_checks(self.root,self.output)
        self.assertFalse(any(i['code']=='RAW_ALPHA_OUTLIERS' for i in hard['defects']))
        self.assertTrue(hard['parts']['HAIR_FRONT']['raw_alpha_outliers_cleaned'])
        self.assertGreater(hard['parts']['HAIR_FRONT']['raw']['outlier_bbox_ratio'],1.15)
        self.assertLessEqual(hard['parts']['HAIR_FRONT']['outlier_bbox_ratio'],1.15)

    def test_significant_raw_outliers_remain_unknown_not_silently_approved(self):
        raw=self.root/self.output/'raw/HAIR_FRONT.png'
        with Image.open(raw) as source:content=source.convert('RGBA')
        im=Image.new('RGBA',(content.width*2,content.height*2));im.paste(content,(content.width//2,content.height//2))
        im.putpixel((0,0),(1,1,1,25));im.save(raw)
        hard,_,_=hard_checks(self.root,self.output)
        self.assertTrue(any(i['code']=='RAW_ALPHA_OUTLIERS' and i['result']=='UNKNOWN' for i in hard['defects']))
        self.assertFalse(hard['parts']['HAIR_FRONT'].get('raw_alpha_outliers_cleaned'))

    def test_real_fourfold_review_accepts_valid_large_hair_without_relaxing_raw_ingestion(self):
        from spine_skin_tool.review_render import scale_bundle
        from spine_skin_tool.assembly import verify_bundle,png_info,AssemblyError
        name='ai-city-template-hair-front.png';im=Image.new('RGBA',(1268,1029));im.paste((40,45,50,255),(2,2,1266,1027));im.save(self.bundle/name)
        atlas=self.bundle/'skeleton.atlas';lines=atlas.read_text(encoding='utf-8').splitlines();active=False
        for i,line in enumerate(lines):
            if line.endswith('.png') and not line[0].isspace():active=line==name
            if active:
                key=line.strip().split(':')[0]
                if key=='size':lines[i]='size: 1268, 1029'
                elif key=='bounds':lines[i]='bounds: 0, 0, 1268, 1029'
                elif key=='offsets':lines[i]='offsets: 0, 0, 1268, 1029'
        atlas.write_text('\n'.join(lines)+'\n',encoding='utf-8');self.update_manifest(name);self.update_manifest('skeleton.atlas')
        variant=self.root/'runtime/work/review-fourfold';scale_bundle(self.bundle,variant,4);verify_bundle(variant)
        with Image.open(variant/name) as scaled:self.assertEqual(scaled.size,(5072,4116))
        with self.assertRaises(AssemblyError):png_info(variant/name)
