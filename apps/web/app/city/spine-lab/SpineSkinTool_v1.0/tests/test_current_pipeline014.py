"""Current orchestration with injected providers/decisions, not art approval."""
import copy,json,unittest
from unittest.mock import patch
import test_pipeline as fixtures
from spine_skin_tool.pipeline import advance
from spine_skin_tool.codex_subscription import SubscriptionError


class CurrentPipeline014Tests(unittest.TestCase):
 def setUp(self):self.f=fixtures.PipelineTests('test_disabled_photo_design_never_submits');self.f.setUp();self.root=self.f.root
 def tearDown(self):self.f.tearDown()
 def test_visible_photo_ears_use_local_standard_pass_without_extra_image_jobs(self):
  png=self.f.fake_setup();state=self.f.task(False,live_design=True,live_generation=True,max_image_calls=40,max_repair_cycles=0);analysis={**self.f.fake_design(),'ear_mode':'HIDDEN','ear_observation':{'left':'VISIBLE','right':'UNCLEAR','reason_ja':'原写真の片側に耳が見えます。'}}
  with patch('spine_skin_tool.photo_design.execute',return_value=analysis),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)) as generator,patch('spine_skin_tool.hair_stages.stage_gate',return_value=True),patch('spine_skin_tool.ear_pass.create_request',side_effect=AssertionError('no AI ear request')):result=advance(self.root,state['id'])
  self.assertEqual(generator.call_count,6);self.assertEqual(result['ear_mode'],'PARTIAL_BOTH');self.assertFalse(result.get('ear_jobs'));self.assertTrue(result.get('standard_ear_artifact'));self.assertEqual(result['initial_image_calls_reserved'],6);self.assertEqual(result['candidates'][-1]['kind'],'EAR_STANDARD');self.assertFalse(result['quality_approved'])
 def run_flow(self,block=False):
  png=self.f.fake_setup();state=self.f.task(False,live_design=True,live_generation=True,max_image_calls=40,max_repair_cycles=3 if block else 0)
  design={**self.f.fake_design(),'ear_mode':'HIDDEN'};counts={}
  def provider(spec,prompt,paths,job,**kwargs):
   r=json.loads((job/'report.json').read_text());part=r['part'];counts[part]=counts.get(part,0)+1
   if block and part=='LEG_FRONT':raise SubscriptionError('CODEX_OUTPUT_MODERATION_BLOCKED')
   return png,None
  with patch('spine_skin_tool.photo_design.execute',return_value=design),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',side_effect=provider),patch('spine_skin_tool.hair_stages.stage_gate',return_value=True):result=advance(self.root,state['id'])
  return result,counts
 def test_known_block_counts_four_and_other_parts_continue_without_placeholder(self):
  state,counts=self.run_flow(True);self.assertEqual(counts['LEG_FRONT'],4);self.assertEqual(counts['LEG_BACK'],1);self.assertEqual(len(state['failed_jobs']),4);self.assertEqual(state['exhausted_parts'],['LEG_FRONT']);self.assertEqual(state['status'],'OUTPUT_BLOCKED');self.assertFalse(state['candidates']);self.assertFalse(state['quality_approved'])
 def test_hidden_mode_never_sends_ear_jobs_or_claims_human_approval(self):
  state,counts=self.run_flow();self.assertEqual(sum(counts.values()),6);self.assertEqual(state['ear_stage'],'HIDDEN');self.assertFalse(state.get('ear_jobs'));self.assertFalse(state['quality_approved']);flow=json.loads((self.root/state['output']/'export/bundle/flow-manifest.json').read_text());self.assertEqual(flow['ear_mode'],'HIDDEN');self.assertEqual(flow['owner_flow_id'],state['id'])
 def test_hidden_mode_low_confidence_is_hair_pending_not_a_missing_ear_failure(self):
  png=self.f.fake_setup();state=self.f.task(False,live_design=True,live_generation=True,max_image_calls=40,max_repair_cycles=0)
  with patch('spine_skin_tool.photo_design.execute',return_value={**self.f.fake_design(),'ear_mode':'HIDDEN'}),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(png,None)),patch('spine_skin_tool.hair_stages.stage_gate',return_value=False):result=advance(self.root,state['id'])
  self.assertEqual(result['ear_stage'],'HIDDEN');self.assertIsNone(result['ear_stop_reason']);self.assertTrue(result['hair_fit_confirmation_pending']);self.assertFalse(result['quality_approved']);self.assertFalse(result.get('ear_jobs'))
 def test_paused_configuration_preserves_history_counts_and_refuses_second_amendment(self):
  from spine_skin_tool.pipeline import enable_part_repairs,totals
  from spine_skin_tool.pipeline_store import commit,cancel,directory
  state=self.f.task(False,max_repair_cycles=0);state['status']='CANCELLED';state['initial_image_calls_reserved']=2;commit(self.root,state,'SYNTHETIC_PAUSED_WITH_TWO_RESERVATIONS');cancel(self.root,state['id'])
  changed=enable_part_repairs(self.root,state['id']);self.assertEqual(changed['limits']['max_repair_cycles'],3);self.assertEqual(changed['status'],'PLANNED');self.assertEqual(totals(self.root,changed)['image_calls_reserved'],2);self.assertFalse((directory(self.root,state['id'])/'cancel.requested').exists());self.assertEqual(changed['configuration_amendments'][0]['before'],0)
  with self.assertRaisesRegex(ValueError,'FLOW_REPAIR_CONFIGURATION_ALREADY_SET'):enable_part_repairs(self.root,state['id'])
 def test_configuration_never_clears_an_unknown_send_or_busy_worker(self):
  from spine_skin_tool.pipeline import enable_part_repairs
  from spine_skin_tool.character_session import get,begin
  from spine_skin_tool.pipeline_store import commit
  state=self.f.task(False,max_repair_cycles=0);ref=get(self.root,state['id']);job=self.root/'runtime/work/unknown';job.mkdir();begin(ref,job,'fixed instruction','LEG_FRONT')
  with self.assertRaisesRegex(ValueError,'SESSION_PENDING_OR_CLOSED'):enable_part_repairs(self.root,state['id'])
  state['status']='RUNNING';commit(self.root,state,'SYNTHETIC_BUSY')
  with self.assertRaisesRegex(ValueError,'FLOW_REPAIR_CONFIGURATION_BUSY'):enable_part_repairs(self.root,state['id'])
