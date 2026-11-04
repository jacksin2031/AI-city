"""Provider protocol tests only; fake transport never reaches a vendor or ComfyUI."""
import base64
import copy
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from PIL import Image
import test_assembly
from spine_skin_tool.generation import defaults,validate_settings,generate,GenerationError,cloud_result,download_public,comfy_generate,prepare_trial_inputs,provider_status,build_part_prompt,references
from spine_skin_tool.assembly import png_info

def png(opaque=False):
    image=Image.new('RGBA',(20,30),(70,90,110,255))
    if not opaque:image.putpixel((0,0),(0,0,0,0))
    b=io.BytesIO();image.save(b,format='PNG');return b.getvalue()

class FakeTransport:
    def __init__(self,items):self.items=list(items);self.calls=[]
    def request(self,method,url,headers=None,body=None):
        self.calls.append((method,url,headers or {},body))
        if not self.items:raise AssertionError('UNEXPECTED_EXTRA_REQUEST')
        response=self.items.pop(0)
        if isinstance(response,Exception):raise response
        return response if isinstance(response,bytes) else json.dumps(response).encode()

class GenerationTests(unittest.TestCase):
    def setUp(self):
        from spine_skin_tool import generation
        self.legacy_generation=patch.dict(generation.VERSIONS['models'],{'image_prompt_revision':'image-prompt-013'});self.legacy_generation.start()
        from spine_skin_tool.assembly import VERSIONS
        self.legacy_models=patch.dict(VERSIONS['models'],{'image_prompt_revision':'image-prompt-013'});self.legacy_workflow=patch.dict(VERSIONS['workflow'],{'revision':'photo-to-skin-shared-013','hair_fit_revision':'head-alpha-fit-006'});self.legacy_models.start();self.legacy_workflow.start()
        self.fixture=test_assembly.AssemblyTests();self.fixture.setUp();self.f=self.fixture
        self.root=self.f.root;(self.root/'runtime/secrets').mkdir(parents=True)
        photo=self.root/'runtime/work/M04';photo.mkdir(parents=True)
        Image.new('RGBA',(24,32),(130,80,65,255)).save(photo/'character-reference.png')
        self.config=defaults();self.payload={'provider':'grok','part':'BODY_FRONT','description':'Green coat, preserve rounded hem','execute':False}
        self.environment=patch.dict(os.environ,{'OPENAI_API_KEY':'fake-local-test-key','XAI_API_KEY':'fake-local-grok-key'});self.environment.start()
        self.login=patch('spine_skin_tool.generation.login_status',return_value=True);self.login.start()
    def tearDown(self):self.login.stop();self.environment.stop();self.fixture.tearDown();self.legacy_workflow.stop();self.legacy_models.stop();self.legacy_generation.stop()
    def save(self,live=False):
        self.config.update(live_enabled=live,upload_consent=live,billing_source='SUBSCRIPTION_API_CREDITS_CONFIRMED' if live else 'UNVERIFIED')
        (self.root/'runtime/secrets/providers.json').write_text(json.dumps(self.config),encoding='utf-8')
    def call(self,transport):return generate(self.root,self.f.profile,self.f.atlas,self.payload,transport)
    def test_prompt_assigns_reference_roles_and_keeps_sleeves_in_arm_layers(self):
        prompt=build_part_prompt('BODY_FRONT','plain white shirt',[140,195])
        self.assertIn('neutral canvas-and-anchor guide',prompt)
        self.assertIn('140 x 195 pixels',prompt)
        self.assertIn('original photo controls visible design',prompt)
        self.assertIn('Image 1 is the original character photo and is mandatory',prompt)
        self.assertIn('Never use a previously generated part, candidate, contact sheet or preview as an image input',prompt)
        self.assertNotIn('CURRENT DESIGN',prompt)
        self.assertIn('do not draw sleeve caps or upper-arm fabric',prompt.lower())
        self.assertIn('true transparent background',prompt)
    def test_hair_prompt_takes_cut_and_color_from_person_and_forbids_style_hair_copy(self):
        prompt=build_part_prompt('HAIR_FRONT','short black hair from the photo')
        self.assertIn("Image 1 is the ORIGINAL HUMAN PHOTO",prompt)
        self.assertIn('never copy their character or haircut',prompt)
        self.assertIn('short black hair from the photo',prompt)
        self.assertIn('old alpha mask',prompt)
        self.assertIn('Every new HAIR attempt starts from the original photo',prompt)
    def test_references_are_photo_first_and_exclude_generated_context(self):
        jobs=self.root/'runtime/work/M04/references';jobs.mkdir(parents=True)
        first_job=jobs/'first';first_job.mkdir();second_job=jobs/'second';second_job.mkdir()
        first=references(self.f.profile,self.f.atlas,'BODY_FRONT',first_job,self.root)
        generated=self.root/'runtime/work/M04/candidate-0001';generated.mkdir()
        Image.new('RGBA',(2,3),(100,170,220,255)).save(generated/'ai-city-template-body.png')
        second=references(self.f.profile,self.f.atlas,'BODY_FRONT',second_job,self.root)
        self.assertEqual([p.name for p in first],['character.png','canvas-guide.png','fixed-head-ears.png','style-1.png','style-2.png'])
        with Image.open(first[1]) as guide:self.assertEqual(guide.size,tuple(self.f.profile['parts']['BODY_FRONT']['canvas']))
        self.assertEqual([p.read_bytes() for p in first],[p.read_bytes() for p in second])
        self.assertEqual(len(first),5)
    def test_hair_style_images_do_not_show_reference_hairstyles(self):
        job=self.root/'runtime/work/M04/hair-references';job.mkdir()
        paths=references(self.f.profile,self.f.atlas,'HAIR_FRONT',job,self.root)
        style_root=Path(__file__).resolve().parents[2]/'library/Chibi-Stickers-4.3/extracted/images'
        self.assertEqual(paths[3].read_bytes(),(style_root/'harri/body.png').read_bytes())
        with Image.open(paths[4]) as sheet:self.assertEqual(sheet.size,(640,360))
        # The two original body images are composited without cropping or source hair.
        from PIL import ImageOps
        with Image.open(paths[4]) as sheet:
            for index,name in enumerate(('davide','spineboy')):
                with Image.open(style_root/f'{name}/body.png') as original:
                    thumb=ImageOps.contain(original.convert('RGBA'),(300,300))
                x=index*320+(320-thumb.width)//2;y=42+(300-thumb.height)//2
                for row in range(thumb.height):
                    for col in range(thumb.width):
                        if thumb.getpixel((col,row))[3]==255:
                            self.assertEqual(sheet.getpixel((x+col,y+row)),thumb.getpixel((col,row)))
    def test_exported_part_prompts_match_provider_contract_and_original_reference_roles(self):
        from spine_skin_tool.trials import trial_request,default_trial
        from spine_skin_tool.generation import PART_PROMPTS,REFERENCE_ROLES,VERSIONS
        config=default_trial(self.f.profile);config['notes']='white shirt; inferred charcoal trousers'
        request=trial_request(config,self.f.profile)
        self.assertEqual(request['input_image_roles'],REFERENCE_ROLES)
        self.assertEqual(request['prompt_revision'],VERSIONS['models']['image_prompt_revision'])
        for key in request['parts']:
            with self.subTest(part=key):
                prompt=request['parts'][key]['prompt']
                self.assertEqual(prompt,build_part_prompt(key,config['notes'],request['parts'][key]['export_canvas']))
                if key.startswith('HAIR'):
                    self.assertIn('ORIGINAL fixed chibi head',prompt)
                    self.assertIn('Draw NO ears',prompt)
                    self.assertIn('Ordinary shadows, gradients',prompt)
                else:
                    self.assertIn('LEGS < TORSO/SKIRT < ARMS < HEAD_GROUP',prompt)
                    self.assertIn('LEGS < ARMS < TORSO/SKIRT < HEAD_GROUP',prompt)
                    self.assertIn('Hide original ear attachments in EVERY view and emote',prompt)
                    self.assertIn('warm deeper skin-tone outline',prompt)
                self.assertIn('Harri',prompt)
        self.assertIn('NO shoulder area',request['parts']['BODY_FRONT']['prompt'])
        self.assertIn('NO shoulder area',request['parts']['BODY_BACK']['prompt'])
        self.assertIn('no fingers, separate thumb',request['parts']['ARM_FRONT']['prompt'])
        self.assertIn('no fingers, separate thumb',request['parts']['ARM_BACK']['prompt'])
        self.assertIn('continuous OPAQUE rear hair cap',request['parts']['HAIR_BACK']['prompt'])
        self.assertIn('approximately the same dominant trouser hue',request['parts']['LEG_FRONT']['prompt'])
    def test_limb_references_use_original_harri_component(self):
        style_root=Path(__file__).resolve().parents[2]/'library/Chibi-Stickers-4.3/extracted/images'
        for part,component in [('ARM_FRONT','arm'),('ARM_BACK','arm'),('LEG_FRONT','leg'),('LEG_BACK','leg')]:
            job=self.root/f'runtime/work/M04/ref-{part}';job.mkdir()
            paths=references(self.f.profile,self.f.atlas,part,job,self.root)
            self.assertEqual(len(paths),5)
            self.assertEqual(paths[3].read_bytes(),(style_root/f'harri/{component}.png').read_bytes())
    def test_default_preflight_and_live_gate_do_not_contact_transport(self):
        fake=FakeTransport([]);result=self.call(fake)
        self.assertEqual(result['status'],'PREFLIGHT_ONLY_NO_MODEL_CALL');self.assertIn('BODY_FRONT',result['prompt'])
        self.assertEqual(result['reference_roles'],['original_character_photo','neutral_canvas_anchor_guide','fixed_head_and_ear_reuse_reference','harri_construction_and_style_reference','davide_spineboy_style_reference'])
        self.assertTrue(result['character_reference_required']);self.assertTrue(result['character_reference_present'])
        self.assertEqual(fake.calls,[]);self.payload['execute']=True
        with self.assertRaisesRegex(GenerationError,'LIVE_DISABLED'):self.call(fake)
        self.assertFalse((self.root/'runtime/work/M04/generation/jobs').exists())
    def test_subscription_generation_uses_no_http_or_api_key_and_is_importable(self):
        self.save(True);self.payload.update(provider='codex',execute=True)
        self.config['billing_source']='UNVERIFIED'
        (self.root/'runtime/secrets/providers.json').write_text(json.dumps(self.config),encoding='utf-8')
        fake=FakeTransport([])
        with patch('spine_skin_tool.generation.generate_image',return_value=(png(),None)) as builtin:
            report=self.call(fake)
        self.assertEqual(len(builtin.call_args.args[2]),5);self.assertEqual(fake.calls,[])
        self.assertEqual(report['billing_source'],'CODEX_SUBSCRIPTION');self.assertTrue(report['alpha_ready'])
        path=self.root/'runtime/work/M04/generation/jobs'/report['id']
        self.assertEqual((path/'raw-image.bin').read_bytes(),png())
        self.assertNotIn('fake-local-test-key',(path/'report.json').read_text())
    def test_old_openai_provider_rejected_and_subscription_auth_failure_reserves_nothing(self):
        self.save(True);self.payload.update(provider='openai',execute=True)
        with self.assertRaisesRegex(GenerationError,'REQUEST_PART'):self.call(FakeTransport([]))
        self.payload['provider']='codex'
        with patch('spine_skin_tool.generation.login_status',return_value=False):
            with self.assertRaisesRegex(GenerationError,'CODEX_CHATGPT_LOGIN_REQUIRED'):self.call(FakeTransport([]))
        self.assertFalse((self.root/'runtime/work/M04/generation/jobs').exists())
    def test_grok_edit_is_json_with_multi_references_and_opaque_artifact_import(self):
        self.save(True);self.payload.update(provider='grok',execute=True)
        fake=FakeTransport([{'data':[{'b64_json':base64.b64encode(png(True)).decode()}]}]);report=self.call(fake)
        body=json.loads(fake.calls[0][3]);self.assertEqual(fake.calls[0][2]['Content-Type'],'application/json')
        self.assertEqual(body['n'],1);self.assertEqual(len(body['images']),5);self.assertEqual(body['response_format'],'b64_json')
        self.assertTrue(body['images'][0]['url'].startswith('data:image/png;base64,'));self.assertFalse(report['alpha_ready'])
        before=(self.f.parts/'ai-city-template-body.png').read_bytes()
        with self.assertRaisesRegex(GenerationError,'OUTPUT_ALPHA_REQUIRED'):
            prepare_trial_inputs(self.root,self.f.profile,self.f.atlas,self.f.parts,report['id'])
        self.assertEqual(before,(self.f.parts/'ai-city-template-body.png').read_bytes())
    def test_live_generation_requires_original_photo_before_reserving_call(self):
        self.save(True);self.payload['execute']=True
        (self.root/'runtime/work/M04/character-reference.png').unlink()
        fake=FakeTransport([])
        with self.assertRaisesRegex(GenerationError,'CHARACTER_REFERENCE_REQUIRED'):self.call(fake)
        self.assertEqual(fake.calls,[])
        self.assertFalse((self.root/'runtime/work/M04/generation/jobs').exists())
    def test_timeout_and_bad_response_never_retry_and_reservation_limits_calls(self):
        self.save(True);self.payload['execute']=True;fake=FakeTransport([GenerationError('NETWORK_RESULT_UNKNOWN_NO_RETRY')])
        with self.assertRaises(GenerationError):self.call(fake)
        self.assertEqual(len(fake.calls),1)
        with self.assertRaisesRegex(GenerationError,'LIVE_CALL_LIMIT'):self.call(FakeTransport([]))
        job=next((self.root/'runtime/work/M04/generation/jobs').glob('job-*'));self.assertEqual(json.loads((job/'report.json').read_text())['status'],'FAILED_OR_RESULT_UNKNOWN_NO_RETRY')
        import shutil
        self.assertTrue(job.resolve().is_relative_to(self.root.resolve()))
        shutil.rmtree(job)
        with self.assertRaisesRegex(GenerationError,'LIVE_CALL_LIMIT'):self.call(FakeTransport([]))
    def test_response_validation_and_media_ssrf_and_no_auth_on_download(self):
        for data in ({'data':[]},{'data':[{'b64_json':'!!'}]},{'data':[{}]}):
            with self.assertRaises(GenerationError):cloud_result(json.dumps(data).encode(),FakeTransport([]))
        for url in ('file:///secret','http://127.0.0.1/a','https://attacker.example/image','https://user:key@imgen.x.ai/image'):
            with self.assertRaises(GenerationError):download_public(url,FakeTransport([]))
        with patch('socket.getaddrinfo',return_value=[(None,None,None,None,('127.0.0.1',443))]):
            with self.assertRaises(GenerationError):download_public('https://imgen.x.ai/a',FakeTransport([]))
        fake=FakeTransport([png()])
        with patch('socket.getaddrinfo',return_value=[(None,None,None,None,('8.8.8.8',443))]):download_public('https://imgen.x.ai/a',fake)
        self.assertEqual(fake.calls[0][2],{})
    def test_config_and_billing_gate(self):
        for key,value in [('max_live_calls',True),('live_enabled',1),('billing_source','web_subscription')]:
            c=copy.deepcopy(self.config);c[key]=value
            with self.assertRaises(GenerationError):validate_settings(c,self.root)
        c=copy.deepcopy(self.config);c['comfyui']['url']='http://example.com:8188'
        with self.assertRaises(GenerationError):validate_settings(c,self.root)
        self.save(True);self.config['billing_source']='UNVERIFIED';(self.root/'runtime/secrets/providers.json').write_text(json.dumps(self.config))
        self.payload['execute']=True
        with self.assertRaisesRegex(GenerationError,'BILLING_UNVERIFIED'):self.call(FakeTransport([]))
        status=provider_status(self.root);self.assertEqual(status['subscription_balance'],'NOT_VERIFIED');self.assertNotIn('fake-local-test-key',json.dumps(status))
    def test_config_file_key_is_used_server_side_and_never_returned(self):
        secret='unit-test-config-key-marker';self.save(True);self.config['grok']['api_key']=secret
        (self.root/'runtime/secrets/providers.json').write_text(json.dumps(self.config),encoding='utf-8')
        self.payload['execute']=True
        fake=FakeTransport([{'data':[{'b64_json':base64.b64encode(png()).decode()}]}])
        with patch.dict(os.environ,{'XAI_API_KEY':''}):
            report=self.call(fake);status=provider_status(self.root)
        self.assertEqual(fake.calls[0][2]['Authorization'],'Bearer '+secret)
        self.assertTrue(status['providers']['grok']['credential_present'])
        self.assertNotIn(secret,json.dumps(report));self.assertNotIn(secret,json.dumps(status))
        self.assertNotIn(secret,(self.root/'runtime/work/M04/generation/jobs'/report['id']/'report.json').read_text())
    def test_legacy_config_discards_openai_key_and_disables_live_until_reviewed(self):
        legacy=defaults();legacy.pop('codex');legacy['schema_version']='1.1.0'
        legacy['openai']={'api_key':'legacy-must-not-be-used'};legacy['live_enabled']=True
        migrated=validate_settings(legacy,self.root)
        self.assertEqual(migrated['schema_version'],'2.0.0')
        self.assertNotIn('openai',migrated);self.assertNotIn('legacy-must-not-be-used',json.dumps(migrated))
        self.assertFalse(migrated['live_enabled']);self.assertIn('codex',migrated)
    def test_numbered_original_photo_selection_and_path_rejection(self):
        photo=self.root/'runtime/work/M04/character-reference2.png'
        Image.new('RGBA',(9,10),(110,120,130,255)).save(photo)
        self.payload['character_reference']='character-reference2.png'
        result=self.call(FakeTransport([]));self.assertEqual(result['character_reference_name'],photo.name)
        self.payload['character_reference']='../../secrets/providers.json'
        with self.assertRaisesRegex(GenerationError,'REFERENCE_PATH'):self.call(FakeTransport([]))
    def test_standard_arm_does_not_use_cloud_or_live_gate(self):
        self.payload.update(provider='standard',part='ARM_FRONT',execute=True)
        fake=FakeTransport([]);result=self.call(fake)
        self.assertFalse(result['ai_generated']);self.assertEqual(result['model_calls_reserved'],0);self.assertEqual(fake.calls,[])
        self.assertFalse(list((self.root/'runtime/work/M04/generation/jobs').glob('*.reserved')))
    def test_optional_skirt_has_its_own_prompt_and_original_erikari_reference(self):
        self.payload['part']='SKIRT_FRONT';result=self.call(FakeTransport([]))
        self.assertIn('erikari_skirt_construction_reference',result['reference_roles'])
        self.assertIn('ONE separate front-view',result['prompt'])
        job=self.root/'runtime/work/M04/skirt-reference';job.mkdir()
        paths=references(self.f.profile,self.f.atlas,'SKIRT_FRONT',job,self.root)
        original=Path(__file__).resolve().parents[2]/'library/Chibi-Stickers-4.3/extracted/images/erikari/skirt.png'
        self.assertEqual(paths[3].read_bytes(),original.read_bytes())
    def workflow(self):
        c=self.config['comfyui'];c.update(prompt_node='1',prompt_input='text',image_bindings=[{'node':str(n),'input':'image'} for n in (2,3,4,5,6)],output_node='7',max_polls=1)
        (self.root/'runtime/secrets/comfy-workflow.json').write_text(json.dumps({'1':{'inputs':{'text':''}},**{str(n):{'inputs':{'image':''}} for n in (2,3,4,5,6)},'7':{'inputs':{}}}))
        return c
    def test_comfy_mock_upload_queue_history_output_and_no_workflow_mutation(self):
        self.workflow();self.save(True);self.payload.update(provider='comfyui',execute=True)
        workflow=(self.root/'runtime/secrets/comfy-workflow.json').read_bytes()
        fake=FakeTransport([{'name':f'ref{i}.png'} for i in range(5)]+[{'prompt_id':'queue-test','node_errors':{}},{'queue-test':{'outputs':{'7':{'images':[{'filename':'out.png','subfolder':'','type':'output'}]}}}},png()])
        report=self.call(fake);self.assertEqual(len(fake.calls),8);self.assertIn('/upload/image',fake.calls[0][1]);self.assertIn('/history/queue-test',fake.calls[6][1]);self.assertIn('/view?',fake.calls[7][1])
        queued=json.loads(fake.calls[5][3]);self.assertEqual(queued['prompt']['2']['inputs']['image'],'ref0.png')
        self.assertEqual(workflow,(self.root/'runtime/secrets/comfy-workflow.json').read_bytes())
        self.assertTrue((self.root/'runtime/work/M04/generation/jobs'/report['id']/'queue.json').is_file())
    def test_comfy_mock_rejection_and_timeout_preserve_queue_id(self):
        self.workflow();job=self.root/'comfy-job';job.mkdir();paths=[self.f.parts/'ai-city-template-body.png']*5
        fake=FakeTransport([{'name':f'{i}.png'} for i in range(5)]+[{'prompt_id':'pending'},{}])
        with self.assertRaisesRegex(GenerationError,'COMFY_TIMEOUT'):comfy_generate(self.config,'prompt',paths,job,fake,self.root,sleep=lambda _:None)
        self.assertTrue((job/'queue.json').is_file());self.assertEqual(sum('/prompt' in c[1] for c in fake.calls),1)
        bad=FakeTransport([{'name':'../../escape.png'}])
        with self.assertRaisesRegex(GenerationError,'COMFY_UPLOAD_PATH'):comfy_generate(self.config,'prompt',paths,job,bad,self.root)
