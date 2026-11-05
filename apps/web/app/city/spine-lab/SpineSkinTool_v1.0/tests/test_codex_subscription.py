"""Subscription adapter boundary tests: fake CLI, no provider traffic."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch
from spine_skin_tool.codex_subscription import clean_environment,generate_image,login_status,SubscriptionError,terminal_usage_limit

class SubscriptionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.job=Path(self.temp.name)
        self.spec={'executable':'codex','timeout_seconds':600}
        self.paths=[self.job/f'ref-{i}.png' for i in range(5)]
    def tearDown(self):self.temp.cleanup()
    def test_api_credentials_not_inherited(self):
        with patch.dict(os.environ,{'OPENAI_API_KEY':'secret','OPENAI_BASE_URL':'https://example.invalid','AZURE_OPENAI_API_KEY':'secret','CODEX_HOME':'local-auth'}):
            value=clean_environment()
        self.assertNotIn('OPENAI_API_KEY',value);self.assertNotIn('OPENAI_BASE_URL',value)
        self.assertNotIn('AZURE_OPENAI_API_KEY',value);self.assertEqual(value['CODEX_HOME'],'local-auth')
    def test_login_requires_chatgpt_not_api(self):
        with patch('shutil.which',return_value='codex.exe'),patch('subprocess.run',return_value=types.SimpleNamespace(returncode=0,stdout=b'Logged in using an API key',stderr=b'')):
            self.assertFalse(login_status(self.spec))
        with patch('shutil.which',return_value='codex.exe'),patch('subprocess.run',return_value=types.SimpleNamespace(returncode=0,stdout=b'',stderr=b'Logged in using ChatGPT')):
            self.assertTrue(login_status(self.spec))
    def run_cli(self,argv,**kwargs):
        self.argv=argv;self.kwargs=kwargs
        output=self.job/'new.png';output.write_bytes(b'\x89PNG\r\n\x1a\nPNG bytes validated by caller')
        (self.job/'codex-result.json').write_text(json.dumps({'status':'GENERATED','image_path':str(output.resolve())}),encoding='utf-8')
        return types.SimpleNamespace(returncode=0)
    def test_forced_subscription_five_images_stdin_prompt_and_local_output(self):
        with patch('shutil.which',return_value='codex.exe'),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('subprocess.run',side_effect=self.run_cli) as run:
            content,_=generate_image(self.spec,'photo design\nmaterial relative outlines',self.paths,self.job)
        self.assertEqual(content,b'\x89PNG\r\n\x1a\nPNG bytes validated by caller');self.assertEqual(run.call_count,1)
        self.assertIn('forced_login_method="chatgpt"',self.argv);self.assertIn('--ignore-user-config',self.argv)
        self.assertEqual(self.argv.count('--image'),5);self.assertIn('read-only',self.argv)
        self.assertNotIn('OPENAI_API_KEY',self.kwargs['env']);self.assertIn(b'BUILT-IN image_gen',self.kwargs['input'])
        self.assertTrue(self.kwargs['input'].endswith(b'photo design\nmaterial relative outlines'))
        self.assertEqual((self.job/'prompt.txt').read_bytes(),b'photo design\nmaterial relative outlines')
    def test_timeout_no_retry_and_no_generated_claim(self):
        with patch('shutil.which',return_value='codex.exe'),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('subprocess.run',side_effect=subprocess.TimeoutExpired('codex',600)) as run:
            with self.assertRaisesRegex(SubscriptionError,'TIMEOUT_RESULT_UNKNOWN'):generate_image(self.spec,'prompt',self.paths,self.job)
        self.assertEqual(run.call_count,1)
    def test_moderation_rejection_is_distinct_and_does_not_retry(self):
        def blocked(argv,**kwargs):
            kwargs['stderr'].write(b'moderation_blocked')
            return types.SimpleNamespace(returncode=0)
        with patch('shutil.which',return_value='codex.exe'),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('subprocess.run',side_effect=blocked) as run:
            with self.assertRaisesRegex(SubscriptionError,'OUTPUT_MODERATION_BLOCKED'):generate_image(self.spec,'prompt',self.paths,self.job)
        self.assertEqual(run.call_count,1)
    def test_unavailable_and_external_or_stale_path_are_rejected(self):
        for status,path in [('UNAVAILABLE',''),('GENERATED',str(Path(self.temp.name).parent/'foreign.png')),('GENERATED','relative.png')]:
            def finish(*args,**kwargs):
                (self.job/'codex-result.json').write_text(json.dumps({'status':status,'image_path':path}),encoding='utf-8')
                return types.SimpleNamespace(returncode=0)
            with self.subTest(status=status,path=path),patch('shutil.which',return_value='codex.exe'),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('subprocess.run',side_effect=finish):
                with self.assertRaises(SubscriptionError):generate_image(self.spec,'prompt',self.paths,self.job)

    def test_terminal_quota_requires_failed_turn_not_agent_text_or_missing_output(self):
        events=self.job/'codex-events.jsonl'
        self.assertFalse(terminal_usage_limit(self.job))
        for event,expected in [(None,False),([],False),({'type':'item.completed','item':{'text':'usage limit exceeded'}},False),({'type':'error','message':'usage limit'},False),({'type':'turn.failed','error':{'message':'connection closed'}},False),({'type':'turn.failed','error':{'message':'You have hit your usage limit'}},True),({'type':'turn.failed','error':{'code':'rate_limit_exceeded'}},True)]:
            events.write_text(json.dumps(event),encoding='utf-8');self.assertEqual(terminal_usage_limit(self.job),expected)

    def test_returned_safety_and_quota_statuses_are_distinct_with_no_retry(self):
        for status,reason,code in [('OUTPUT_BLOCKED','OUTPUT_MODERATION','OUTPUT_MODERATION_BLOCKED'),('RATE_LIMITED','SUBSCRIPTION_LIMIT','SUBSCRIPTION_LIMIT_REACHED')]:
            def finish(*args,**kwargs):
                (self.job/'codex-result.json').write_text(json.dumps({'status':status,'reason_code':reason,'image_path':''}),encoding='utf-8')
                return types.SimpleNamespace(returncode=0)
            with patch('shutil.which',return_value='codex.exe'),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('subprocess.run',side_effect=finish) as run:
                with self.assertRaisesRegex(SubscriptionError,code):generate_image(self.spec,'prompt',self.paths,self.job)
            self.assertEqual(run.call_count,1)

    def test_nonzero_cli_terminal_quota_maps_to_quota_not_generic_unknown(self):
        def finish(*args,**kwargs):
            kwargs['stdout'].write(json.dumps({'type':'turn.failed','error':{'code':'usage_limit_reached'}}).encode());return types.SimpleNamespace(returncode=1)
        with patch('shutil.which',return_value='codex.exe'),patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('subprocess.run',side_effect=finish) as run:
            with self.assertRaisesRegex(SubscriptionError,'SUBSCRIPTION_LIMIT_REACHED'):generate_image(self.spec,'prompt',self.paths,self.job)
        self.assertEqual(run.call_count,1)
