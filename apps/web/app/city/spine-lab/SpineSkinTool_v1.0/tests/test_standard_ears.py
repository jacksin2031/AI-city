"""Visible-ear policy and zero-model fixed-base augmentation, synthetic photos only."""
import copy,json,unittest
from unittest.mock import patch
from PIL import Image,ImageChops,ImageDraw
import test_head_first as fixtures
from spine_skin_tool import ear_policy,standard_ears
from spine_skin_tool.ear_pass import compute
from spine_skin_tool.character_flow import assemble_character,bindings_from_source
from spine_skin_tool.character import region
from spine_skin_tool.assembly import canonical
from spine_skin_tool.design import digest,DesignError
from spine_skin_tool.review import hard_checks

VISIBLE={'left':'VISIBLE','right':'UNCLEAR','reason_ja':'片側の耳が確認できます。正面用には左右の標準耳を用います。'}
HIDDEN={'left':'HAIR_OCCLUDED','right':'HAIR_OCCLUDED','reason_ja':'両側とも髪で完全に覆われています。'}

class StandardEarPolicyTests(unittest.TestCase):
 def test_only_two_clearly_hair_occluded_sides_allow_hidden(self):
  for left in ear_policy.VALUES:
   for right in ear_policy.VALUES:self.assertEqual(ear_policy.choose({'left':left,'right':right,'reason_ja':'確認記録。'}),'HIDDEN' if left==right=='HAIR_OCCLUDED' else 'PARTIAL_BOTH')
  with self.assertRaisesRegex(DesignError,'EAR_OBSERVATION_REASON'):ear_policy.choose({**VISIBLE,'reason_ja':''})

class StandardEarsTests(unittest.TestCase):
 def setUp(self):self.f=fixtures.HeadFirstTests();self.f.setUp();self.root=self.f.root
 def tearDown(self):self.f.tearDown()
 def artifact(self):return standard_ears.create_artifact(self.root,self.f.base,ear_policy.record(self.root,self.f.s,VISIBLE,'USER_AND_PHOTO_REVIEW'))
 def build(self):
  identity=self.artifact();output='runtime/work/standard-ears-output';bindings,_=bindings_from_source(self.root,self.f.record['design_id'],self.f.base)
  with patch('spine_skin_tool.generation.generate_image',side_effect=AssertionError('no model')),patch('spine_skin_tool.review_visual.execute_review_request',side_effect=AssertionError('no model')):assemble_character(self.root,self.f.record['design_id'],bindings,output,auto_fit=True,fit_revision='head-alpha-fit-006',ear_artifact=identity)
  return output
 def test_both_views_keep_hair_world_transform_and_pixels_outside_new_ears(self):
  images,layout,fit=compute(self.root,self.artifact());skin=next(s for s in json.loads((self.root/self.f.base/'export/bundle/skeleton.json').read_text())['skins'] if s['name']=='ai-city-original-template')['attachments'];head,_=standard_ears.target_head(self.root)
  for part,slot in [('HAIR_FRONT','hair-front'),('HAIR_BACK','back-hair')]:
   with Image.open(self.root/self.f.base/'export/bundle'/('ai-city-template-hair-front.png' if part.endswith('FRONT') else 'ai-city-template-hair-back.png')) as im:base=im.convert('RGBA')
   old=skin[slot][slot];new,_=region(images[part],'test',layout['front_width' if part.endswith('FRONT') else 'back_width'],layout['top' if part.endswith('FRONT') else 'back_top'],anchor_x=layout['front_anchor_x' if part.endswith('FRONT') else 'back_anchor_x'],center_x=0)
   u=old['width']/base.width;self.assertAlmostEqual(new['width']/images[part].width,u,places=9);old_left=-old['y']-old['width']/2;new_left=-new['y']-new['width']/2;old_top=old['x']+old['height']/2;new_top=new['x']+new['height']/2;dx=round((old_left-new_left)/u);dy=round((new_top-old_top)/u);sample=images[part].crop((dx,dy,dx+base.width,dy+base.height));diff=ImageChops.difference(sample,base).convert('RGB');mask=ImageChops.lighter(diff.getchannel('R'),ImageChops.lighter(diff.getchannel('G'),diff.getchannel('B')));mask=ImageChops.multiply(mask,base.getchannel('A').point(lambda x:255 if x else 0));draw=ImageDraw.Draw(mask)
   for wx,wy in fit['metrics']['shared_ear_targets']['points']:draw.rectangle(((wx-head['height']*.16-old_left)/u,(old_top-wy-head['height']*.10)/u,(wx+head['height']*.16-old_left)/u,(old_top-wy+head['height']*.10)/u),fill=0)
   self.assertIsNone(mask.getbbox());m=fit['ear_pass']['measurements'][part];self.assertTrue(m['both_ears_present']);self.assertFalse(m['original_hair_resampled']);self.assertTrue(all(e['visible_fraction']>=.4 for e in m['per_ear']))
  self.assertEqual(fit['ear_pass']['measurements']['HAIR_FRONT']['roots_head_local'],fit['ear_pass']['measurements']['HAIR_BACK']['roots_head_local'])
 def test_fit008_nonuniform_rear_scale_keeps_frozen_hair_and_visible_ears(self):
  import hashlib
  from spine_skin_tool.assembly import verify_bundle
  bundle=self.root/self.f.base/'export/bundle'
  original_raw={part:digest(self.root/self.f.base/'raw'/f'{part}.png') for part in ('HAIR_FRONT','HAIR_BACK')}
  fit=json.loads((bundle/'hair-fit.json').read_text(encoding='utf-8'))
  fit['revision']='head-alpha-fit-008';fit['layout']['back_scale_y']=.78
  fit.pop('fit_id',None);fit['fit_id']=hashlib.sha256(canonical(fit)).hexdigest()
  (bundle/'hair-fit.json').write_bytes(canonical(fit)+b'\n')
  skeleton=json.loads((bundle/'skeleton.json').read_text(encoding='utf-8'))
  skin=next(x for x in skeleton['skins'] if x['name']=='ai-city-original-template')['attachments']
  skin['back-hair']['back-hair']['height']*=.78
  (bundle/'skeleton.json').write_bytes(canonical(skeleton)+b'\n')
  flow=json.loads((bundle/'flow-manifest.json').read_text(encoding='utf-8'))
  flow['geometry_fit']={'fit_id':fit['fit_id'],'revision':'head-alpha-fit-008','status':fit['metrics']['status']};flow['ear_stage']='BARE_HAIR'
  (bundle/'flow-manifest.json').write_bytes(canonical(flow)+b'\n')
  manifest=json.loads((bundle/'build-manifest.json').read_text(encoding='utf-8'))
  for name in ('hair-fit.json','skeleton.json','flow-manifest.json'):manifest['files'][name]=digest(bundle/name)
  (bundle/'build-manifest.json').write_bytes(canonical(manifest)+b'\n')
  verify_bundle(bundle)
  artifact_id=self.artifact()
  images,layout,result=compute(self.root,artifact_id)
  self.assertAlmostEqual(layout['back_scale_y'],.78)
  for part,details in result['ear_pass']['measurements'].items():
   self.assertEqual(len(details['per_ear']),2)
   self.assertTrue(all(e['visible_fraction']>=.4 for e in details['per_ear']))
   self.assertFalse(details['original_hair_resampled'])
   self.assertEqual(details['hair_base_sha256'],original_raw[part])
  self.assertNotIn('head_units_per_pixel_y',result['ear_pass']['measurements']['HAIR_FRONT'])
  self.assertLess(result['ear_pass']['measurements']['HAIR_BACK']['head_units_per_pixel_y'],result['ear_pass']['measurements']['HAIR_BACK']['head_units_per_pixel'])
  self.assertEqual(original_raw,{part:digest(self.root/self.f.base/'raw'/f'{part}.png') for part in original_raw})

 def test_real_shared_assembly_keeps_all_raw_parts_and_has_bound_ear_provenance(self):
  output=self.build();source=self.root/self.f.base;target=self.root/output
  for p in (source/'raw').glob('*.png'):self.assertEqual(digest(p),digest(target/'raw'/p.name))
  flow=json.loads((target/'export/bundle/flow-manifest.json').read_text(encoding='utf-8'));self.assertEqual(flow['ear_mode'],'PARTIAL_BOTH');self.assertEqual(flow['standard_ears']['model_calls'],0);self.assertTrue(flow['reuse_existing_character']);before={d['code'] for d in hard_checks(self.root,self.f.base)[0]['defects'] if d['result']=='FAIL'};after={d['code'] for d in hard_checks(self.root,output)[0]['defects'] if d['result']=='FAIL'};self.assertLessEqual(after,before)
 def test_missing_actual_ear_provenance_cannot_become_a_hidden_mode_pass(self):
  output=self.build();folder=self.root/output/'export/bundle';flow=json.loads((folder/'flow-manifest.json').read_text(encoding='utf-8'));flow['ear_mode']='HIDDEN';(folder/'flow-manifest.json').write_bytes(canonical(flow)+b'\n');m=json.loads((folder/'build-manifest.json').read_text(encoding='utf-8'));m['files']['flow-manifest.json']=digest(folder/'flow-manifest.json');(folder/'build-manifest.json').write_bytes(canonical(m)+b'\n');self.assertIn('STANDARD_EAR_ARTIFACT_REQUIRED',[d['code'] for d in hard_checks(self.root,output)[0]['defects']])
 def test_photo_change_invalidates_saved_visibility_decision(self):
  identity=self.artifact();photo=self.root/'runtime/work/M04'/self.f.s['photo'];Image.new('RGBA',(16,20),'blue').save(photo)
  with self.assertRaisesRegex(DesignError,'EAR_DECISION_PHOTO_CHANGED'):compute(self.root,identity)
 def state(self):
  from spine_skin_tool.pipeline_store import commit,directory
  s={**self.f.s,'mode':'GENERATE','phase':'DONE','status':'REQUIRES_REVIEW','quality_approved':False,'ear_mode':'HIDDEN','versions':{'workflow':'photo-to-skin-shared-013','fit':'head-alpha-fit-006'},'output':self.f.base,'jobs':{},'candidates':[{'output':self.f.base,'manifest_sha256':digest(self.root/self.f.base/'export/bundle/build-manifest.json'),'review_id':None,'kind':'INITIAL'}],'initial_image_calls_reserved':6,'analysis_calls_reserved':1,'initial_visual_calls_reserved':0}
  directory(self.root,s['id']).mkdir(parents=True);return commit(self.root,s,'SYNTHETIC_SAVED_CHARACTER')
 def test_ear_only_entry_is_idempotent_and_never_opens_a_model_session(self):
  from spine_skin_tool.ear_service import apply
  s=self.state()
  with patch('spine_skin_tool.generation.generate_image',side_effect=AssertionError('no model')),patch('spine_skin_tool.review_visual.execute_review_request',side_effect=AssertionError('no model')):
   a=apply(self.root,s['id'],VISIBLE,capture=False);b=apply(self.root,s['id'],VISIBLE,capture=False)
  self.assertEqual(len(a['candidates']),2);self.assertEqual(a['best_manifest_sha256'],b['best_manifest_sha256']);self.assertEqual(a['initial_image_calls_reserved'],6);self.assertFalse(a['quality_approved'])
 def test_confirmed_hair_occlusion_does_not_touch_the_existing_character(self):
  from spine_skin_tool.ear_service import apply
  s=self.state();a=apply(self.root,s['id'],HIDDEN,capture=False);self.assertEqual(a['candidates'],s['candidates']);self.assertEqual(a['ear_mode'],'HIDDEN')
