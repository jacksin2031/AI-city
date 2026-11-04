"""Head-first and fixed-base ear composition boundaries; synthetic, no model calls."""
import copy,json,unittest,io
from unittest.mock import patch
from pathlib import Path
from PIL import Image,ImageDraw
import test_review_integration
from spine_skin_tool.design import digest,DesignError,load_design
from spine_skin_tool.character_flow import assemble_character,bindings_from_directory
from spine_skin_tool.ear_pass import pieces,create_request,artifact,compute,load_request as load_ear_request
from spine_skin_tool.hair_stages import bare_prompt,bounds
from spine_skin_tool.assembly import canonical

class HeadFirstTests(unittest.TestCase):
 def setUp(self):
  from spine_skin_tool import generation
  self.legacy_generation=patch.dict(generation.VERSIONS['models'],{'image_prompt_revision':'image-prompt-013'});self.legacy_generation.start()
  from spine_skin_tool.assembly import VERSIONS
  self.legacy_workflow=patch.dict(VERSIONS['workflow'],{'revision':'photo-to-skin-shared-013','hair_fit_revision':'head-alpha-fit-006'});self.legacy_models=patch.dict(VERSIONS['models'],{'image_prompt_revision':'image-prompt-013','review_prompt_revision':'review-prompt-009'});self.legacy_workflow.start();self.legacy_models.start()
  self.f=test_review_integration.ReviewIntegrationTests();self.f.setUp();self.root=self.f.root;self.record=json.loads((self.root/self.f.output/'design.json').read_text(encoding='utf-8'));self.base='runtime/work/head-first-base'
  front=Image.new('RGBA',(400,450));d=ImageDraw.Draw(front);d.rounded_rectangle((20,20,380,430),radius=80,fill='#49372B');d.rounded_rectangle((65,120,335,449),radius=45,fill=(0,0,0,0));front.save(self.root/'runtime/work/raw/HAIR_FRONT.png')
  back=Image.new('RGBA',(400,450));ImageDraw.Draw(back).rounded_rectangle((20,20,380,430),radius=85,fill='#49372B');back.save(self.root/'runtime/work/raw/HAIR_BACK.png')
  assemble_character(self.root,self.record['design_id'],bindings_from_directory(self.root,self.record['design_id'],'runtime/work/raw'),self.base,auto_fit=True,fit_revision='head-alpha-fit-006')
  self.fit=json.loads((self.root/self.base/'export/bundle/hair-fit.json').read_text(encoding='utf-8'));self.s={'id':'flow-'+'e'*32,'design_id':self.record['design_id'],'photo':'character-reference.png','ear_base_output':self.base,'ear_base_manifest_sha256':digest(self.root/self.base/'export/bundle/build-manifest.json'),'ear_jobs':{},'ear_requests':{}}
 def tearDown(self):
  self.f.tearDown();self.legacy_models.stop();self.legacy_generation.stop();self.legacy_workflow.stop()
 def pair(self):
  im=Image.new('RGBA',(240,160));d=ImageDraw.Draw(im);d.ellipse((20,40,60,120),fill='#FFD4C1',outline='#9D6B66',width=4);d.ellipse((180,40,220,120),fill='#FFD4C1',outline='#9D6B66',width=4);return im
 def job(self,part='HAIR_FRONT'):
  req=create_request(self.root,self.s,part);job='job-'+('a' if part=='HAIR_FRONT' else 'b')*32;p=self.root/'runtime/work/M04/generation/jobs'/job;p.mkdir(parents=True);self.pair().save(p/'image.png');report={'id':job,'part':part,'ear_request_id':req,'status':'GENERATED_AWAITING_MANUAL_REVIEW'};(p/'report.json').write_bytes(canonical(report));self.s['ear_jobs'][part]=job;self.s['ear_requests'][part]=req;return p,req
 def test_bare_prompt_has_no_ear_anchor_and_reference_sizes_not_pixel_locks(self):
  p=bare_prompt('HAIR_FRONT','short hair');self.assertIn('Draw NO ears',p);self.assertIn('286 wide x 249 high',p);self.assertIn('NO old-PNG',p);self.assertNotIn('EAR ROOT ANCHORS FIRST',p)
 def test_pair_height_is_recorded_on_shared_head_not_canvas(self):
  h=self.fit['metrics']['height_alignment'];self.assertEqual(h['coordinate_space'],'HEAD_LOCAL_SPINE_UNITS');self.assertLess(h['top_difference'],.01);self.assertGreater(h['front']['head_hair_height'],0);self.assertIn('shared_ear_targets',self.fit['metrics'])
 def test_invalid_ear_outputs_are_not_silently_reused(self):
  for im in (Image.new('RGBA',(100,100)),Image.new('RGBA',(100,100),'#FFD4C1')):
   with self.assertRaises(DesignError):pieces(im)
  self.assertEqual(len(pieces(self.pair())),2)
 def test_front_ear_composition_keeps_original_hair_and_common_height(self):
  before={p:digest(self.root/self.base/'raw'/f'{p}.png') for p in ('HAIR_FRONT','HAIR_BACK')};job,req=self.job();identity=artifact(self.root,self.s);images,layout,fit=compute(self.root,identity)
  self.assertEqual(before,{p:digest(self.root/self.base/'raw'/f'{p}.png') for p in before});self.assertEqual(fit['ear_pass']['stage'],'FRONT_EARS');self.assertEqual(fit['ear_pass']['measurements']['HAIR_FRONT']['roots_head_local'],self.fit['metrics']['shared_ear_targets']['points']);self.assertEqual(fit['ear_pass']['measurements']['HAIR_BACK']['roots_head_local'],[])
  h=fit['metrics']['height_alignment'];self.assertLess(abs(h['front']['head_hair_top']-self.fit['metrics']['height_alignment']['front']['head_hair_top']),2)
  bindings=bindings_from_directory(self.root,self.record['design_id'],'runtime/work/raw');out='runtime/work/ear-candidate';assemble_character(self.root,self.record['design_id'],bindings,out,auto_fit=True,ear_artifact=identity)
  from spine_skin_tool.review import hard_checks
  review,_,_=hard_checks(self.root,out);self.assertFalse(any(d['code'] in ('INPUT_PROVENANCE','NORMALIZED_PART_MISMATCH','LAYOUT_GEOMETRY_MISMATCH','FIT_EAR_PASS_CHANGED') for d in review['defects']))
  (job/'image.png').write_bytes(b'tampered')
  with self.assertRaises(DesignError):compute(self.root,identity)
 def test_back_ear_cannot_start_before_front_review_approval(self):
  with self.assertRaisesRegex(DesignError,'EAR_FRONT_APPROVAL_REQUIRED'):create_request(self.root,self.s,'HAIR_BACK')
 def test_reference_changes_stop_before_model_call(self):
  _,req=self.job();d=load_ear_request(self.root,req);p=self.root/d['inputs'][1]['file'];p.write_bytes(b'tampered')
  with self.assertRaisesRegex(DesignError,'EAR_REFERENCE_CHANGED'):load_ear_request(self.root,req)

 def orchestrate(self,gate=True,hook=None):
  from spine_skin_tool.pipeline import create,edit_design,advance,DEFAULTS
  from spine_skin_tool.generation import defaults
  from spine_skin_tool.assembly import make_profile
  root=self.root;cfg=defaults();cfg.update(live_enabled=True,upload_consent=True,max_live_calls=20);(root/'runtime/secrets').mkdir(exist_ok=True);(root/'runtime/secrets/providers.json').write_bytes(canonical(cfg))
  source=(self.f.source,self.f.atlas,make_profile(self.f.source,self.f.atlas));design=copy.deepcopy(self.record['design'])
  def provider(config,prompt,paths,job):
   (job/'prompt.txt').write_bytes(prompt.encode('utf-8'))
   r=json.loads((job/'report.json').read_text(encoding='utf-8'));im=self.pair() if 'Output ONLY TWO SMALL' in prompt else Image.open(root/'runtime/work/raw'/f"{r['part']}.png").convert('RGBA');out=io.BytesIO();im.save(out,format='PNG');return out.getvalue(),None
  with patch('spine_skin_tool.pipeline.source_profile',return_value=source),patch('spine_skin_tool.repair.source_profile',return_value=source),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',side_effect=provider) as model,patch('spine_skin_tool.hair_stages.stage_gate',return_value=gate):
   state=create(root,{'mode':'GENERATE','photo':'character-reference.png','character_id':design['character_id'],'limits':{**DEFAULTS,'live_generation':True,'max_image_calls':10,'max_repair_cycles':0}});edit_design(root,state['id'],design);result=advance(root,state['id'],hook)
  return result,model.call_count
 def test_pipeline_orders_front_then_back_on_one_fixed_base_with_eight_calls(self):
  # Stage advisory decisions are mocked here; image/assembly/store logic is real.
  state,calls=self.orchestrate(True);self.assertEqual(calls,8);self.assertEqual(state['ear_stage'],'BOTH_EARS');self.assertEqual(len(state['ear_jobs']),2);self.assertFalse(state['quality_approved'])
  front=load_ear_request(self.root,state['ear_requests']['HAIR_FRONT']);back=load_ear_request(self.root,state['ear_requests']['HAIR_BACK']);self.assertEqual(front['base_output'],back['base_output']);self.assertIsNone(front['front_approval']);self.assertEqual(back['front_approval']['review_id'],state['front_ear_approval']['review_id'])
  from spine_skin_tool.production_timing import summary
  clock=summary(self.root,state['id']);self.assertEqual({r['part'] for r in clock['parts'] if r['part'].startswith('EARS_')},{'EARS_FRONT','EARS_BACK'});self.assertIsNotNone(clock['selected_assembly_seconds'])
 def test_unconfirmed_bare_hair_never_spends_ear_calls(self):
  state,calls=self.orchestrate(False);self.assertEqual(calls,6);self.assertEqual(state['ear_stop_reason'],'BARE_HAIR_NOT_CONFIRMED');self.assertFalse(state.get('ear_jobs'))

 def test_ear_layer_inspection_keeps_exported_pixels_identical(self):
  self.job();identity=artifact(self.root,self.s);first,layout,fit=compute(self.root,identity);views={};second,layout2,fit2=compute(self.root,identity,inspection=views)
  self.assertEqual(fit,fit2);self.assertEqual(layout,layout2);self.assertTrue(all(first[k].tobytes()==second[k].tobytes() for k in first));self.assertEqual(set(views),{'HAIR_FRONT','HAIR_BACK'})
 def test_replay_preserves_ear_artifact_and_exact_bundle_without_new_images(self):
  from spine_skin_tool.pipeline import create,advance,DEFAULTS
  from spine_skin_tool.assembly import make_profile,bundle_zip
  state,calls=self.orchestrate(True);source=(self.f.source,self.f.atlas,make_profile(self.f.source,self.f.atlas))
  with patch('spine_skin_tool.pipeline.source_profile',return_value=source),patch('spine_skin_tool.repair.source_profile',return_value=source),patch('spine_skin_tool.generation.generate') as generator:
   task=create(self.root,{'mode':'REPLAY','source_output':state['output'],'limits':{**DEFAULTS,'max_repair_cycles':0}});result=advance(self.root,task['id'])
  generator.assert_not_called();self.assertEqual(bundle_zip(self.root/state['output']/'export/bundle'),bundle_zip(self.root/result['output']/'export/bundle'))
 def test_head_only_diagnostic_is_not_a_character_or_model_job(self):
  from spine_skin_tool.head_diagnostic import diagnostic
  state,calls=self.orchestrate(False);before=len(list((self.root/'runtime/work/M04/generation/jobs').glob('codex-call-*.reserved')))
  with patch('spine_skin_tool.generation.generate_image') as image:found=diagnostic(self.root,state['id'])
  image.assert_not_called();self.assertFalse(found[0]['quality_approved']);self.assertEqual(found[0]['stage'],'HEAD_ONLY_DIAGNOSTIC_NOT_ASSEMBLED_CHARACTER');self.assertEqual(before,len(list((self.root/'runtime/work/M04/generation/jobs').glob('codex-call-*.reserved'))))
 def test_review_only_migration_preserves_old_context_and_costs(self):
  from spine_skin_tool.assembly import VERSIONS,make_profile
  from spine_skin_tool.pipeline import reassess_ear_stage,contract,context
  from spine_skin_tool.pipeline_store import directory,commit,read
  from spine_skin_tool.review import read_review,save_report,review_dir
  with patch.dict(VERSIONS['models'],{'review_prompt_revision':'review-prompt-008'}):state,calls=self.orchestrate(True)
  # Construct a stopped, already-returned advisory UNKNOWN at front-ear stage.
  front=next(c for c in state['candidates'] if c['kind']=='EAR_FRONT');state['candidates']=[c for c in state['candidates'] if c['kind']!='EAR_BACK'];state.update(output=front['output'],review_id=front['review_id'],ear_stage='STOPPED',ear_stop_reason='FRONT_EARS_NOT_CONFIRMED',phase='DONE',status='REQUIRES_REVIEW');state['ear_jobs'].pop('HAIR_BACK');state['ear_requests'].pop('HAIR_BACK');state['limits']['live_review']=True;commit(self.root,state,'SYNTHETIC_UNKNOWN_FRONT')
  r=read_review(self.root,front['review_id']);folder=review_dir(self.root,front['review_id'])/'evidence';folder.mkdir();m={'review_id':front['review_id'],'files':{},'frames':[]};m['evidence_hash']=__import__('hashlib').sha256(canonical(m)).hexdigest();(folder/'manifest.json').write_bytes(canonical(m));r['render']={'status':'PASS','evidence_hash':m['evidence_hash'],'defects':[]};r['visual_call']['status']='COMPLETED_ADVISORY';r['visual_reviews']=[{'source':'CODEX_SUBSCRIPTION','data':{'checks':[{'category':'ear_visibility','result':'UNKNOWN'}],'defects':[]}}];save_report(self.root,r)
  old=directory(self.root,state['id'])/'context.json';sha=digest(old);source=(self.f.source,self.f.atlas,make_profile(self.f.source,self.f.atlas))
  with patch('spine_skin_tool.pipeline.source_profile',return_value=source),patch('spine_skin_tool.generation.generate') as generator:updated=reassess_ear_stage(self.root,state['id']);context(self.root,updated)
  generator.assert_not_called();self.assertEqual(digest(old),sha);self.assertEqual(updated['ear_image_calls_reserved'],state['ear_image_calls_reserved']);self.assertEqual(updated['phase'],'CAPTURE');self.assertNotEqual(updated['context_file'],'context.json');self.assertIn(front['review_id'],updated['candidates'][-1]['superseded_reviews'])
