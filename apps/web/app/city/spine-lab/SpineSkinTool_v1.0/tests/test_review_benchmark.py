"""Calibration honesty, isolation and persistent-call failure boundaries; never cloud calls."""
import copy,hashlib,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from spine_skin_tool.assembly import canonical
from spine_skin_tool.design import DesignError
from spine_skin_tool.review_benchmark import metrics,validate,request,load,run,save,score
from spine_skin_tool.review_visual import normative_criteria


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='spine benchmark ');self.root=Path(self.temp.name);self.identity='bench-'+'b'*32
        self.job=self.root/'runtime/work/M05/benchmarks'/self.identity;self.job.mkdir(parents=True)
        for name in ('references.png','image-a.png','image-b.png'):(self.job/name).write_bytes(b'test fixture bytes, not actual image')
        cases=[{'id':i,'character':c,'split':s,'criterion':'HAIR_GAP','expected':e,'runtime':False,'image':im} for i,c,s,e,im in [('anonymous-a','c01','development','FAIL','image-a.png'),('anonymous-b','c02','holdout','PASS','image-b.png')]]
        self.data={'benchmark_id':self.identity,'criteria':normative_criteria(),'confidence_floor':.9,'prompt_revision':'calibration-prompt-001','cases':cases,'batches':[{'id':0,'split':'development','cases':['anonymous-a']},{'id':1,'split':'holdout','cases':['anonymous-b']}],'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in self.job.iterdir()},'limitations':['CONTROLLED_ONLY']}
        self.data['benchmark_hash']=hashlib.sha256(canonical(self.data)).hexdigest();save(self.job/'manifest.json',self.data)
        secrets=self.root/'runtime/secrets';secrets.mkdir();save(secrets/'calibration.json',{'live_enabled':True,'max_live_calls':1,'timeout_seconds':60})
    def tearDown(self):self.temp.cleanup()
    def value(self):return {'benchmark_hash':self.data['benchmark_hash'],'items':[{'case_id':'anonymous-a','criterion':'HAIR_GAP','result':'FAIL','confidence':.99,'message_ja':'亀裂があります。'}]}
    def test_unknown_or_low_confidence_never_count_as_success(self):
        r=metrics([{'expected':'FAIL','observed':'PASS','confidence':.95},{'expected':'PASS','observed':'FAIL','confidence':.95},{'expected':'FAIL','observed':'UNKNOWN'},{'expected':'PASS','observed':'PASS','confidence':.3}],.9)
        self.assertEqual((r['false_negative'],r['false_positive'],r['unknown']),(1,1,2));self.assertEqual(r['true_positive']+r['true_negative'],0)
    def test_missing_duplicates_wrong_case_evidence_reject(self):
        for key,value in [('benchmark_hash','x'),('items',[])]:
            a=self.value();a[key]=value
            with self.assertRaises(ValueError):validate(self.data,0,a)
        for key,value in [('case_id','anonymous-b'),('criterion','PROPORTION'),('confidence',True),('confidence',float('nan'))]:
            a=self.value();a['items'][0][key]=value
            with self.assertRaises(ValueError):validate(self.data,0,a)
    def test_model_request_hides_labels_split_source_and_other_cases(self):
        r=request(self.root,self.identity,0);p=r['prompt']
        # A random digest can contain e.g. c01 by coincidence. Check labels
        # outside the exact opaque digest, not substrings of its hex encoding.
        self.assertIn(self.data['benchmark_hash'],p)
        p=p.replace(self.data['benchmark_hash'],'<OPAQUE_BENCHMARK_HASH>')
        for secret in ('expected','label_basis','holdout','anonymous-b','c01','c02'):self.assertNotIn(secret,p)
        self.assertIn('anonymous-a',p);self.assertEqual(len(r['image_files']),2)
    def test_changed_evidence_and_norms_invalidate(self):
        (self.job/'image-a.png').write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'BENCH_EVIDENCE_CHANGED'):load(self.root,self.identity)
    def test_manifest_changed_labels_reject(self):
        data=copy.deepcopy(self.data);data['cases'][0]['expected']='PASS';save(self.job/'manifest.json',data)
        with self.assertRaisesRegex(DesignError,'BENCH_MANIFEST_CHANGED'):load(self.root,self.identity)
    def test_unexecuted_never_counts_as_calibrated(self):
        report=score(self.root,self.identity);self.assertEqual(report['status'],'PARTIAL');self.assertEqual(report['summary']['holdout']['vision']['unknown'],1);self.assertFalse(report['automatic_visual_pass_enabled'])
    def test_heldout_cannot_run_before_development(self):
        with self.assertRaisesRegex(DesignError,'BENCH_DEVELOPMENT_FIRST'):run(self.root,self.identity,1)
    def test_timeout_is_reserved_and_not_retried(self):
        with patch('spine_skin_tool.generation.settings',return_value={'codex':{}}),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.review_benchmark.execute_review_request',side_effect=subprocess.TimeoutExpired('codex',60)) as transport:
            r=run(self.root,self.identity,0)
        self.assertEqual(r['calls'][0]['status'],'ERROR_OR_UNKNOWN_NO_RETRY');transport.assert_called_once()
        with self.assertRaisesRegex(DesignError,'BENCH_ALREADY_STARTED'),patch('spine_skin_tool.generation.settings',return_value={'codex':{}}),patch('spine_skin_tool.codex_subscription.login_status',return_value=True):run(self.root,self.identity,0)
        self.assertEqual(len(list(self.job.parent.glob('*.reserved'))),1)
    def test_validated_result_tamper_is_detected(self):
        call=self.job/'calls/0';call.mkdir(parents=True);save(call/'validated.json',self.value());save(call/'call.json',{'batch':0,'status':'COMPLETED','result_sha256':hashlib.sha256((call/'validated.json').read_bytes()).hexdigest()})
        save(call/'validated.json',{'changed':True})
        with self.assertRaisesRegex(DesignError,'BENCH_RESULT_CHANGED'):score(self.root,self.identity)

    def test_submitted_prompt_snapshot_tamper_is_detected(self):
        call=self.job/'calls/0';call.mkdir(parents=True);save(call/'validated.json',self.value());save(call/'visual-submitted-request.json',{'prompt':'frozen'})
        save(call/'call.json',{'batch':0,'status':'COMPLETED','result_sha256':hashlib.sha256((call/'validated.json').read_bytes()).hexdigest(),'request_sha256':hashlib.sha256((call/'visual-submitted-request.json').read_bytes()).hexdigest()})
        save(call/'visual-submitted-request.json',{'prompt':'changed'})
        with self.assertRaisesRegex(DesignError,'BENCH_REQUEST_CHANGED'):score(self.root,self.identity)

    def test_running_development_is_not_a_finished_blind_precondition(self):
        call=self.job/'calls/0';call.mkdir(parents=True);save(call/'call.json',{'batch':0,'status':'RUNNING'})
        with self.assertRaisesRegex(DesignError,'BENCH_DEVELOPMENT_FIRST'):run(self.root,self.identity,1)
