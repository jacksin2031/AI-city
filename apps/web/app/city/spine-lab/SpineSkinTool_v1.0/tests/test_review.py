"""QA defects and false-approval boundaries. No model/HTTP calls."""
import copy,hashlib,json,subprocess,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from spine_skin_tool.assembly import canonical
from spine_skin_tool.design import ROOT,DesignError
from spine_skin_tool.texture import standard_arm
from spine_skin_tool.review import check_part,aggregate,policy
from spine_skin_tool.review_render import frame_issues,scale_bundle
from spine_skin_tool.review_calibration import synthetic_frame,run_calibration
from spine_skin_tool.review_visual import validate_visual,evidence,import_visual,run_visual


class ReviewTests(unittest.TestCase):
    def test_ear_pass_cannot_be_claimed_without_real_ear_artifact_or_by_wrong_hidden_choice(self):
        output=self.root/'runtime/work/ear-policy-output/export/bundle';output.mkdir(parents=True);context={'design':{'design':self.design},'character_output':'runtime/work/ear-policy-output'};(self.folder/'context.json').write_bytes(canonical(context))
        observation={'left':'VISIBLE','right':'UNCLEAR','reason_ja':'耳が確認できます。'};flow={'ear_policy_revision':'ear-visibility-002','ear_mode':'PARTIAL_BOTH','ear_stage':'BOTH_EARS','ear_decision':{'observation':observation}};(output/'flow-manifest.json').write_bytes(canonical(flow));(output/'hair-fit.json').write_bytes(canonical({}))
        with self.assertRaisesRegex(DesignError,'VISUAL_EAR_ARTIFACT_REQUIRED'):validate_visual(self.root,self.rid,self.result())
        flow['ear_mode']='HIDDEN';(output/'flow-manifest.json').write_bytes(canonical(flow));data=self.result();next(c for c in data['checks'] if c['category']=='ear_visibility')['result']='NOT_APPLICABLE'
        with self.assertRaisesRegex(DesignError,'EAR_MODE_MISMATCH'):validate_visual(self.root,self.rid,data)
    def test_lower_kind_is_bound_metadata_only_for_pants_not_applicable_skirt_check(self):
        data=self.result();item=next(c for c in data['checks'] if c['category']=='skirt_occlusion');item['evidence_ids']=['design.appearance.lower.kind'];validate_visual(self.root,self.rid,data)
        data['checks'][0]['evidence_ids']=['design.appearance.lower.kind']
        with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,data)
        data=self.result();item=next(c for c in data['checks'] if c['category']=='skirt_occlusion');item['evidence_ids']=['design.appearance.lower.kind'];self.design['appearance']['lower']['kind']='skirt';(self.folder/'context.json').write_text(json.dumps({'design':{'design':self.design}}))
        with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,data)
    def test_only_present_part_tiles_can_resolve_to_the_evidence_sheet(self):
        Image.new('RGBA',(10,10),'#123456').save(self.images/'parts-sheet.png')
        self.manifest.pop('evidence_hash');self.manifest['files']['parts-sheet.png']=hashlib.sha256((self.images/'parts-sheet.png').read_bytes()).hexdigest()
        self.manifest['evidence_hash']=hashlib.sha256(canonical(self.manifest)).hexdigest();(self.images/'manifest.json').write_bytes(canonical(self.manifest))
        self.report['render']['evidence_hash']=self.manifest['evidence_hash'];(self.folder/'report.json').write_bytes(canonical(self.report))
        data=self.result();data['checks'][0]['evidence_ids']=['parts-sheet:HAIR_FRONT']
        self.assertEqual(validate_visual(self.root,self.rid,data)['checks'][0]['evidence_ids'],['parts-sheet'])
        data['checks'][0]['evidence_ids']=['parts-sheet:PRIVATE_PHOTO']
        with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,data)
    def test_overlay_name_is_allowed_only_if_exact_file_is_bound(self):
        data=self.result();data['checks'][0]['evidence_ids']=['ear-fit-overlay']
        with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,data)
        Image.new('RGBA',(10,10),'#123456').save(self.images/'ear-fit-overlay.png')
        self.manifest.pop('evidence_hash');self.manifest['files']['ear-fit-overlay.png']=hashlib.sha256((self.images/'ear-fit-overlay.png').read_bytes()).hexdigest();self.manifest['evidence_hash']=hashlib.sha256(canonical(self.manifest)).hexdigest();(self.images/'manifest.json').write_bytes(canonical(self.manifest));self.report['render']['evidence_hash']=self.manifest['evidence_hash'];(self.folder/'report.json').write_bytes(canonical(self.report));data['evidence_hash']=self.manifest['evidence_hash']
        self.assertEqual(validate_visual(self.root,self.rid,data)['checks'][0]['evidence_ids'],['ear-fit-overlay'])
        data['checks'][0]['evidence_ids']=['ear-fit-overlay.png']
        self.assertEqual(validate_visual(self.root,self.rid,data)['checks'][0]['evidence_ids'],['ear-fit-overlay'])
        data['checks'][0]['evidence_ids']=['unbound-overlay.png']
        with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,data)
        data['checks'][0]['evidence_ids']=['invented-overlay']
        with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,data)
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='spine review ');self.root=Path(self.tmp.name);self.rid='review-'+'a'*32
        self.folder=self.root/'runtime/work/M05/reviews'/self.rid;self.images=self.folder/'evidence';self.images.mkdir(parents=True)
        self.design=json.loads((ROOT/'fixtures/synthetic/shared-design/design.json').read_text(encoding='utf-8'))
        (self.folder/'context.json').write_text(json.dumps({'design':{'design':self.design}}))
        Image.new('RGBA',(10,10),(80,100,120,255)).save(self.images/'frame.png')
        self.manifest={'review_id':self.rid,'frames':[{'frame_id':'s1-000'}],'files':{'frame.png':hashlib.sha256((self.images/'frame.png').read_bytes()).hexdigest()}}
        self.manifest['evidence_hash']=hashlib.sha256(canonical(self.manifest)).hexdigest();(self.images/'manifest.json').write_bytes(canonical(self.manifest))
        self.report={'review_id':self.rid,'hard':{'status':'PASS','defects':[]},'render':{'status':'PASS','evidence_hash':self.manifest['evidence_hash'],'defects':[]},'visual_reviews':[],'visual_call':{'status':'NOT_RUN','model_calls_reserved':0}}
        (self.folder/'report.json').write_bytes(canonical(self.report))
        self.reader=patch('spine_skin_tool.review_visual.read_review',side_effect=lambda *a,**k:json.loads((self.folder/'report.json').read_text(encoding='utf-8')));self.reader.start()
    def tearDown(self):self.reader.stop();self.tmp.cleanup()
    def result(self,value='PASS',confidence=1):
        return {'review_id':self.rid,'evidence_hash':self.manifest['evidence_hash'],'checks':[{'category':c,'result':'NOT_APPLICABLE' if c=='skirt_occlusion' else value,'confidence':confidence,'evidence_ids':['s1-000'],'message_ja':'確認記録です。'} for c in policy()['required_visual_checks']],'defects':[],'summary_ja':'確認記録です。'}

    def test_unreviewed_or_model_pass_never_auto_approves(self):
        self.assertEqual(aggregate(self.report),'REQUIRES_REVIEW')
        data=self.result();r=import_visual(self.root,self.rid,data,'EXTERNAL_MODEL');self.assertEqual(r['status'],'REQUIRES_REVIEW')
        r=import_visual(self.root,self.rid,data,'HUMAN');self.assertEqual(r['status'],'PASS')

    def test_human_failure_cannot_be_overwritten_by_model_pass(self):
        r=import_visual(self.root,self.rid,self.result('FAIL'),'HUMAN');self.assertEqual(r['status'],'FAIL')
        r=import_visual(self.root,self.rid,self.result(),'EXTERNAL_MODEL');self.assertEqual(r['status'],'FAIL')

    def test_human_defect_cannot_be_overwritten_without_fail_check(self):
        a=self.result();a['defects']=[{'code':'HAIR_GAP','part':'HAIR_FRONT','direction':'front','frame_id':'s1-000','bbox':[],'severity':'MAJOR','confidence':1,'message_ja':'割れ目があります。'}]
        self.assertEqual(import_visual(self.root,self.rid,a,'HUMAN')['status'],'FAIL')
        self.assertEqual(import_visual(self.root,self.rid,self.result(),'EXTERNAL_MODEL')['status'],'FAIL')

    def test_structural_failure_and_render_error_are_never_pass(self):
        r=copy.deepcopy(self.report);r['visual_reviews']=[{'source':'HUMAN','data':self.result()}]
        r['hard']['status']='FAIL';self.assertEqual(aggregate(r),'FAIL')
        r['hard']['status']='PASS';r['render']['status']='ERROR';self.assertEqual(aggregate(r),'REQUIRES_REVIEW')

    def test_unknown_low_confidence_and_unseen_are_not_pass(self):
        for data in (self.result('UNKNOWN'),self.result(confidence=.2)):
            r=import_visual(self.root,self.rid,data,'HUMAN');self.assertEqual(r['status'],'REQUIRES_REVIEW')
        r=import_visual(self.root,self.rid,self.result('FAIL',.2),'EXTERNAL_MODEL');self.assertEqual(r['status'],'REQUIRES_REVIEW')

    def test_missing_duplicate_or_unsupported_categories_reject(self):
        variants=[];a=self.result();a['checks'].pop();variants.append(a)
        a=self.result();a['checks'][1]=copy.deepcopy(a['checks'][0]);variants.append(a)
        a=self.result();a['checks'][0]['result']='NOT_APPLICABLE';variants.append(a)
        a=self.result();a['checks'][0]['evidence_ids']=[];variants.append(a)
        a=self.result();a['checks'][0]['confidence']=float('nan');variants.append(a)
        a=self.result();a['checks'][0]['confidence']=True;variants.append(a)
        for data in variants:
            with self.subTest(data=data),self.assertRaises(ValueError):validate_visual(self.root,self.rid,data)

    def test_wrong_review_hash_or_frame_reject(self):
        for key,value in [('review_id','review-'+'b'*32),('evidence_hash','0'*64)]:
            a=self.result();a[key]=value
            with self.assertRaisesRegex(DesignError,'VISUAL_WRONG_EVIDENCE'):validate_visual(self.root,self.rid,a)
        a=self.result();a['checks'][0]['evidence_ids']=['invented-frame']
        with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,a)

    def test_evidence_image_tampering_rejects_advice(self):
        (self.images/'frame.png').write_bytes(b'changed')
        with self.assertRaisesRegex(DesignError,'EVIDENCE_FILE_CHANGED'):validate_visual(self.root,self.rid,self.result())

    def test_unlocatable_defect_is_allowed_but_invalid_bbox_rejects(self):
        a=self.result('FAIL');a['defects']=[{'code':'HAIR_GAP','part':'HAIR_FRONT','direction':'front','frame_id':'s1-000','bbox':[],'severity':'MAJOR','confidence':.95,'message_ja':'割れ目があります。'}]
        validate_visual(self.root,self.rid,a)
        for box in ([.8,0,.2,.5],[0,0,2,.5],[float('nan'),0,1,1]):
            a['defects'][0]['bbox']=box
            with self.assertRaisesRegex(DesignError,'VISUAL_BOX'):validate_visual(self.root,self.rid,a)

    def test_model_xywh_bbox_keeps_defect_and_records_coordinate_provenance(self):
        data=self.result('FAIL')
        data['defects']=[{'code':'EAR_OCCLUDED','part':'HAIR_FRONT','direction':'front','frame_id':'s1-000','bbox':[.35,.28,.30,.14],'severity':'MAJOR','confidence':.99,'message_ja':'耳が隠れています。'}]
        result=import_visual(self.root,self.rid,data,'CODEX_SUBSCRIPTION')
        self.assertEqual(result['status'],'FAIL')
        recorded=result['visual_reviews'][-1]
        self.assertEqual(recorded['data']['defects'][0]['code'],'EAR_OCCLUDED')
        self.assertEqual(recorded['data']['defects'][0]['severity'],'MAJOR')
        self.assertEqual(len(recorded['bbox_normalizations']),1)
        self.assertEqual(recorded['bbox_normalizations'][0]['reason'],'MODEL_XYWH_TO_XYXY')
        self.assertAlmostEqual(recorded['data']['defects'][0]['bbox'][2],.65,places=7)

    def test_raw_alpha_outliers_do_not_override_clean_assembled_review(self):
        _,issues=check_part(Image.new('RGBA',(20,30)),'HAIR_FRONT',self.design);self.assertIn('EMPTY_PART',[i['code'] for i in issues])
        _,issues=check_part(Image.new('RGBA',(20,30),'red'),'HAIR_FRONT',self.design);self.assertIn('OPAQUE_BACKGROUND',[i['code'] for i in issues])
        im=Image.new('RGBA',(100,100));im.paste((50,50,50,255),(40,40,60,60));im.putpixel((0,0),(1,1,1,1))
        metrics,issues=check_part(im,'HAIR_FRONT',self.design)
        self.assertGreater(metrics['outlier_bbox_ratio'],1.15)
        self.assertFalse(any(i['code']=='ALPHA_OUTLIERS' for i in issues))

    def test_erased_skin_outline_is_not_missed_by_rgba_alpha_bbox(self):
        from spine_skin_tool.reference_assets import library_root
        with Image.open(library_root(ROOT)/'Chibi-Stickers-4.3/extracted/images/harri/arm.png') as source:expected=standard_arm(source,{'sleeve_color':'#F4F0E8','skin_color':'#FFD3BF','sleeve_fraction':.21})
        im=expected.copy();im.putpixel((6,100),(255,211,191,255))
        _,issues=check_part(im,'ARM_FRONT',self.design,expected)
        self.assertIn('STANDARD_ARM_OUTLINE_OR_PALETTE',[x['code'] for x in issues])

    def test_wrong_part_palette_is_diagnostic_until_assembled_visual_review(self):
        image=Image.new('RGBA',(30,40));image.paste((230,20,20,255),(1,1,29,39))
        metrics,issues=check_part(image,'LEG_FRONT',self.design)
        self.assertTrue(metrics['pants_color_visual_review_advisory'])
        self.assertFalse(any(i['code']=='PANTS_COLOR_REQUIRES_REVIEW' for i in issues))

    def test_frame_rules_catch_actual_missing_hair_not_just_order(self):
        for direction in ('front','back','left','right'):
            frame=synthetic_frame(direction);self.assertEqual(frame_issues(frame,True),[])
            for slot in frame['slots']:
                if slot['name']==('back-hair' if direction=='back' else 'hair-front'):slot['attachment']=None
            self.assertIn('HAIR_ATTACHMENT_MISSING',[x['code'] for x in frame_issues(frame,True)])

    def test_ear_presence_order_and_nonfinite_geometry_reject(self):
        frame=synthetic_frame('front')
        for s in frame['slots']:
            if s['name']=='ear-l':s['attachment']=None
        frame['drawOrder'].remove('arm-l');frame['drawOrder'].append('arm-l');frame['bones'][0][0]=float('nan')
        codes=[x['code'] for x in frame_issues(frame,True)]
        for code in ('EAR_ATTACHMENT_VISIBILITY','ARM_IN_FRONT_OF_HEAD','RUNTIME_NONFINITE_GEOMETRY'):self.assertIn(code,codes)

    def test_synthetic_heldout_controls_do_not_approve_semantic_policy(self):
        r=run_calibration(self.root)
        self.assertFalse(r['user_approved']);self.assertFalse(r['automatic_visual_pass_enabled'])
        for split in r['summary'].values():self.assertEqual(split['false_positive'],0);self.assertEqual(split['false_negative'],0)

    def mock_request(self):
        return {'schema':{},'prompt':'Inspect evidence only, no tools.','image_files':[(self.images/'frame.png').relative_to(self.root).as_posix()]*5}

    def test_subscription_adapter_forces_chatgpt_no_api_and_never_auto_passes(self):
        def finish(argv,**kwargs):
            self.argv=argv;self.environment=kwargs['env'];(self.folder/'visual-result.json').write_bytes(canonical(self.result()));return types.SimpleNamespace(returncode=0)
        cfg={'live_enabled':True,'upload_consent':True,'max_live_calls':1,'timeout_seconds':600}
        with patch('spine_skin_tool.review_visual.visual_request',return_value=self.mock_request()),patch('spine_skin_tool.review_visual.review_settings',return_value=cfg),patch('spine_skin_tool.generation.settings',return_value={'codex':{'executable':'codex'}}),patch('spine_skin_tool.review_visual.login_status',return_value=True),patch('spine_skin_tool.review_visual.executable',return_value='codex.exe'),patch('spine_skin_tool.review_visual.subprocess.run',side_effect=finish):
            result=run_visual(self.root,self.rid)
        self.assertIn('forced_login_method="chatgpt"',self.argv);self.assertIn('features.image_generation=false',self.argv);self.assertIn('read-only',self.argv);self.assertEqual(self.argv.count('--image'),5)
        self.assertNotIn('OPENAI_API_KEY',self.environment);self.assertEqual(result['visual_call']['model_calls_reserved'],1);self.assertEqual(result['status'],'REQUIRES_REVIEW')
        snapshot=self.folder/'visual-submitted-request.json';self.assertEqual(result['visual_call']['request_sha256'],hashlib.sha256(snapshot.read_bytes()).hexdigest())
        (self.folder/'visual-request.json').write_text('new dry-run preview',encoding='utf-8')
        self.assertEqual(json.loads(snapshot.read_text(encoding='utf-8')),self.mock_request())

    def test_subscription_setup_failure_is_recorded_without_runner_call(self):
        cfg={'live_enabled':True,'upload_consent':True,'max_live_calls':1,'timeout_seconds':600}
        with patch('spine_skin_tool.review_visual.visual_request',return_value=self.mock_request()),patch('spine_skin_tool.review_visual.review_settings',return_value=cfg),patch('spine_skin_tool.generation.settings',return_value={'codex':{}}),patch('spine_skin_tool.review_visual.login_status',return_value=True),patch('spine_skin_tool.review_visual.executable',side_effect=OSError('not found')),patch('spine_skin_tool.review_visual.subprocess.run') as runner:
            r=run_visual(self.root,self.rid)
        runner.assert_not_called();self.assertEqual(r['status'],'REQUIRES_REVIEW');self.assertEqual(r['visual_call']['status'],'ERROR_OR_RESULT_UNKNOWN_NO_RETRY')

    def test_review_disabled_reserves_no_call(self):
        with patch('spine_skin_tool.review_visual.visual_request',return_value=self.mock_request()):
            with self.assertRaisesRegex(DesignError,'REVIEW_LIVE_DISABLED'):run_visual(self.root,self.rid)
        self.assertEqual(list(self.folder.parent.glob('review-call-*.reserved')),[])

    def test_vision_tool_use_is_rejected_even_with_valid_json(self):
        def finish(argv,**kwargs):
            kwargs['stdout'].write(b'{"item":{"type":"command_execution"}}\n');(self.folder/'visual-result.json').write_bytes(canonical(self.result()))
        cfg={'live_enabled':True,'upload_consent':True,'max_live_calls':1,'timeout_seconds':600}
        with patch('spine_skin_tool.review_visual.visual_request',return_value=self.mock_request()),patch('spine_skin_tool.review_visual.review_settings',return_value=cfg),patch('spine_skin_tool.generation.settings',return_value={'codex':{}}),patch('spine_skin_tool.review_visual.login_status',return_value=True),patch('spine_skin_tool.review_visual.executable',return_value='codex.exe'),patch('spine_skin_tool.review_visual.subprocess.run',side_effect=finish):r=run_visual(self.root,self.rid)
        self.assertEqual(r['visual_call']['error_code'],'VISUAL_UNEXPECTED_TOOL_USE');self.assertEqual(r['status'],'REQUIRES_REVIEW');self.assertEqual(r['visual_reviews'],[])

    def test_timeout_is_unknown_reserved_once_no_retry(self):
        cfg={'live_enabled':True,'upload_consent':True,'max_live_calls':1,'timeout_seconds':600}
        with patch('spine_skin_tool.review_visual.visual_request',return_value=self.mock_request()),patch('spine_skin_tool.review_visual.review_settings',return_value=cfg),patch('spine_skin_tool.generation.settings',return_value={'codex':{'executable':'codex'}}),patch('spine_skin_tool.review_visual.login_status',return_value=True),patch('spine_skin_tool.review_visual.executable',return_value='codex.exe'),patch('spine_skin_tool.review_visual.subprocess.run',side_effect=subprocess.TimeoutExpired('codex',600)) as runner:
            r=run_visual(self.root,self.rid)
        self.assertEqual(runner.call_count,1);self.assertEqual(r['status'],'REQUIRES_REVIEW');self.assertEqual(r['visual_call']['status'],'ERROR_OR_RESULT_UNKNOWN_NO_RETRY');self.assertEqual(len(list(self.folder.parent.glob('review-call-*.reserved'))),1)

    def test_qualified_sheet_frame_ids_resolve_only_when_sheet_is_bound(self):
        sheet={'near-head':['s1-000']};path=self.images/'sheets.json';path.write_bytes(canonical(sheet))
        self.manifest['files']['sheets.json']=hashlib.sha256(path.read_bytes()).hexdigest()
        self.manifest.pop('evidence_hash');self.manifest['evidence_hash']=hashlib.sha256(canonical(self.manifest)).hexdigest();(self.images/'manifest.json').write_bytes(canonical(self.manifest))
        self.report['render']['evidence_hash']=self.manifest['evidence_hash'];(self.folder/'report.json').write_bytes(canonical(self.report))
        value=self.result();value['checks'][0]['evidence_ids']=['near-head:s1-000']
        normalized=validate_visual(self.root,self.rid,value)
        self.assertEqual(normalized['checks'][0]['evidence_ids'],['s1-000']);self.assertEqual(value['checks'][0]['evidence_ids'],['near-head:s1-000'])
        value['checks'][0]['evidence_ids']=['near-head/s1-000'];normalized=import_visual(self.root,self.rid,value,'EXTERNAL_MODEL')
        self.assertEqual(normalized['visual_reviews'][-1]['reference_normalizations'][0]['original'],'near-head/s1-000')
        self.assertEqual(normalized['visual_reviews'][-1]['data']['checks'][0]['evidence_ids'],['s1-000'])
        for ref in ['unknown:s1-000','near-head:invented','unknown/s1-000','near-head/s1-999','near-head/../s1-000']:
            value['checks'][0]['evidence_ids']=[ref]
            with self.assertRaisesRegex(DesignError,'VISUAL_FRAME_ID'):validate_visual(self.root,self.rid,value)

    def test_grouped_parts_stay_unlocated_and_do_not_expand_generation_targets(self):
        value=self.result('FAIL');value['defects']=[{'code':'STYLE_DRIFT','part':'HAIR_FRONT / HAIR_BACK','direction':'all','frame_id':'s1-000','bbox':[],'severity':'MAJOR','confidence':.95,'message_ja':'描画を確認してください。'}]
        r=import_visual(self.root,self.rid,value,'EXTERNAL_MODEL');self.assertEqual(r['visual_reviews'][0]['data']['defects'][0]['part'],'CHARACTER');self.assertEqual(r['visual_reviews'][0]['part_normalizations'][0]['original'],'HAIR_FRONT / HAIR_BACK')
        value['defects'][0]['part']='HAIR_FRONT / BODY_FRONT'
        with self.assertRaisesRegex(DesignError,'VISUAL_DEFECT_CODE'):validate_visual(self.root,self.rid,value)

    def test_returned_vision_result_can_be_recovered_once_without_resending(self):
        from spine_skin_tool.review_visual import recover_visual_result
        request=self.folder/'visual-submitted-request.json';request.write_bytes(b'{}\n');(self.folder/'visual-events.jsonl').write_bytes(b'')
        self.report['visual_call']={'status':'RUNNING','model_calls_reserved':1,'request_sha256':hashlib.sha256(request.read_bytes()).hexdigest()};(self.folder/'report.json').write_bytes(canonical(self.report));(self.folder/'visual-result.json').write_bytes(canonical(self.result()))
        with patch('spine_skin_tool.review_visual.subprocess.run') as runner:
            first=recover_visual_result(self.root,self.rid);second=recover_visual_result(self.root,self.rid)
        runner.assert_not_called();self.assertEqual(first['visual_call']['status'],'COMPLETED_ADVISORY');self.assertEqual(len(second['visual_reviews']),1);self.assertNotEqual(second['status'],'PASS')
