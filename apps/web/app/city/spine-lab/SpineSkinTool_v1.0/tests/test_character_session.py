"""Character conversation isolation and durable bounded sends; no provider traffic."""
import json,tempfile,types,unittest,uuid,re
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool import character_session as cs
from spine_skin_tool.pipeline_store import commit
from spine_skin_tool.codex_subscription import generate_image,SubscriptionError
from spine_skin_tool.design import DesignError
from spine_skin_tool.component_prompts import brief


class CharacterSessionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.work=self.root/'runtime/work/M04';self.work.mkdir(parents=True)
  self.spec={'executable':'codex','timeout_seconds':600};self.commands=[];self.ids={}
 def tearDown(self):self.tmp.cleanup()
 def flow(self,n):
  name=f'character-reference{n}.png';Image.new('RGBA',(8,8),(n,60,90,255)).save(self.work/name);identity='flow-'+str(n)*32
  p=self.root/'runtime/work/M07/tasks'/identity;p.mkdir(parents=True)
  state={'id':identity,'mode':'GENERATE','versions':{'workflow':'photo-to-skin-shared-014'},'photo':name,'design_id':str(n)*64}
  commit(self.root,state,'SYNTHETIC');return cs.get(self.root,identity)
 def job(self,n):
  p=self.root/'runtime/work/M04/generation/jobs'/('job-'+str(n)*32);p.mkdir(parents=True);return p
 def event(self,ref,job,known=True):
  sid=self.ids.setdefault(ref['flow_id'],str(uuid.uuid4()));f=job/'events.jsonl';f.write_text(json.dumps({'type':'thread.started','thread_id':sid})+'\n',encoding='utf-8');cs.finish(ref,job,f,known)
 def test_character_ids_and_photos_never_cross_and_close_does_not_reset_counts(self):
  a,b=self.flow(1),self.flow(2);job=self.job(1);cs.begin(a,job,'pants','LEG_FRONT');self.event(a,job)
  cs.close(self.root,a['flow_id'],'REVIEWED_CANDIDATE')
  av=json.loads((a['folder']/'session.json').read_text());bv=json.loads((b['folder']/'session.json').read_text())
  self.assertNotEqual(av['photo_sha256'],bv['photo_sha256']);self.assertIsNone(bv['session_id']);self.assertEqual(av['parts']['LEG_FRONT'],1)
  with self.assertRaisesRegex(DesignError,'PENDING_OR_CLOSED'):cs.begin(a,self.job(2),'pants','LEG_FRONT')
 def test_unknown_send_stops_next_job_without_refunding_or_fresh_session(self):
  ref=self.flow(1);job=self.job(1);cs.begin(ref,job,'pants','LEG_FRONT');self.event(ref,job,False)
  with self.assertRaisesRegex(DesignError,'PENDING_OR_CLOSED'):cs.begin(ref,self.job(2),'pants','LEG_FRONT')
  value=json.loads((ref['folder']/'session.json').read_text());self.assertEqual(value['parts']['LEG_FRONT'],1);self.assertIsNotNone(value['pending_job'])
 def test_initial_plus_three_repairs_share_one_part_counter(self):
  ref=self.flow(1)
  for i in range(1,5):
   job=self.job(i);cs.begin(ref,job,'changed scoped brief '+str(i),'LEG_FRONT');self.event(ref,job)
  with self.assertRaisesRegex(DesignError,'FOUR_CALL_LIMIT'):cs.begin(ref,self.job(5),'another request','LEG_FRONT')
  job=self.job(6);cs.begin(ref,job,'rear pants','LEG_BACK');self.event(ref,job)
 def test_explicit_resume_same_id_and_no_last_or_ephemeral(self):
  ref=self.flow(1)
  def run(argv,**kw):
   self.commands.append(argv);sid=self.ids.setdefault(ref['flow_id'],str(uuid.uuid4()));kw['stdout'].write((json.dumps({'type':'thread.started','thread_id':sid})+'\n').encode())
   output=Path(argv[argv.index('--output-last-message')+1]);image=output.parent/'new.png';Image.new('RGBA',(4,4),'red').save(image);output.write_text(json.dumps({'status':'GENERATED','reason_code':'NONE','image_path':str(image)}),encoding='utf-8');return types.SimpleNamespace(returncode=0)
  for i in (1,2):
   job=self.job(i)
   with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.codex_subscription.executable',return_value='codex.exe'),patch('subprocess.run',side_effect=run):generate_image(self.spec,'one clothing component',[],job,session=ref,part='LEG_FRONT' if i==1 else 'LEG_BACK')
  self.assertNotIn('resume',self.commands[0]);self.assertIn('resume',self.commands[1]);self.assertIn(self.ids[ref['flow_id']],self.commands[1]);self.assertTrue(all('--last' not in c and '--ephemeral' not in c for c in self.commands))
 def test_returned_different_session_id_is_rejected(self):
  ref=self.flow(1);j=self.job(1);cs.begin(ref,j,'a');self.event(ref,j);j=self.job(2);cs.begin(ref,j,'b');self.ids[ref['flow_id']]=str(uuid.uuid4())
  with self.assertRaisesRegex(DesignError,'ID_CHANGED'):self.event(ref,j)
 def test_identical_designs_in_two_flows_require_explicit_character_owner(self):
  a=self.flow(1);identity='flow-'+'3'*32;p=self.root/'runtime/work/M07/tasks'/identity;p.mkdir(parents=True);commit(self.root,{'id':identity,'mode':'GENERATE','versions':{'workflow':'photo-to-skin-shared-014'},'photo':'character-reference1.png','design_id':'1'*64},'SECOND_OWNER')
  cs.bind_design(self.root,a['flow_id'],'1'*64);cs.bind_design(self.root,identity,'1'*64)
  with self.assertRaisesRegex(DesignError,'AMBIGUOUS_OWNER'):cs.for_design(self.root,'1'*64)
  self.assertEqual(cs.for_design(self.root,'1'*64,identity)['flow_id'],identity);self.assertEqual(cs.for_design(self.root,'1'*64,a['flow_id'])['flow_id'],a['flow_id'])
 def test_legs_brief_contains_only_clothing_scope_and_changes_known_retry(self):
  p=brief('LEG_FRONT','blue fabric, charcoal shoe');self.assertIn('TROUSER LEG',p)
  for word in ('skin','ear','hair','face','exposed','nude'):self.assertIsNone(re.search(r'\b'+word+r'\b',p.lower()))
  self.assertNotEqual(p,brief('LEG_FRONT','blue fabric, charcoal shoe',1))
 def recovered_output(self,count=1,known=True):
  ref=self.flow(1);job=self.job(1);cs.begin(ref,job,'fixed part','HAIR_FRONT');sid=str(uuid.uuid4());self.ids[ref['flow_id']]=sid;home=self.root/'codex';area=home/'generated_images'/sid;area.mkdir(parents=True)
  for i in range(count):Image.new('RGBA',(4,5),(60+i,90,80,120)).save(area/f'output{i}.png')
  self.event(ref,job,known);(job/'codex-events.jsonl').write_bytes((job/'events.jsonl').read_bytes());(job/'codex-result.json').write_text(json.dumps({'status':'GENERATED','reason_code':'NONE','image_path':''}),encoding='utf-8')
  return ref,job,home
 def test_missing_path_recovers_only_unique_saved_output_without_changing_raw_result_or_calls(self):
  from spine_skin_tool.codex_subscription import collect_image_result
  ref,job,home=self.recovered_output();original=(job/'codex-result.json').read_bytes()
  with patch.dict('os.environ',{'CODEX_HOME':str(home)}):content,_=collect_image_result(self.spec,[],job,0,session=ref)
  self.assertEqual(content,(home/'generated_images'/self.ids[ref['flow_id']]/'output0.png').read_bytes());self.assertEqual((job/'codex-result.json').read_bytes(),original);self.assertEqual(json.loads((job/'local-output-path-recovery.json').read_text())['model_calls'],0);self.assertEqual(json.loads((ref['folder']/'session.json').read_text())['parts']['HAIR_FRONT'],1)
 def test_missing_path_never_selects_between_multiple_or_unknown_turn_outputs(self):
  from spine_skin_tool.codex_subscription import collect_image_result
  ref,job,home=self.recovered_output(2)
  with patch.dict('os.environ',{'CODEX_HOME':str(home)}),self.assertRaisesRegex(SubscriptionError,'CODEX_OUTPUT_PATH'):collect_image_result(self.spec,[],job,0,session=ref)
  self.assertFalse((job/'local-output-path-recovery.json').exists())
  (home/'generated_images'/self.ids[ref['flow_id']]/'output1.png').unlink();v=json.loads((ref['folder']/'session.json').read_text());v['turns'][-1]['status']='SENT_RESULT_UNKNOWN';(ref['folder']/'session.json').write_text(json.dumps(v))
  with patch.dict('os.environ',{'CODEX_HOME':str(home)}),self.assertRaisesRegex(SubscriptionError,'CODEX_OUTPUT_PATH'):collect_image_result(self.spec,[],job,0,session=ref)
