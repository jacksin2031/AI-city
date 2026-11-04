"""Injected ENOSPC/corruption/login/model errors are NOT physical fault evidence."""
import errno,json,unittest
from unittest.mock import patch
import test_pipeline as fixtures
from spine_skin_tool.pipeline import advance,edit_design
from spine_skin_tool.pipeline_store import read,directory


class M08FaultTests(unittest.TestCase):
    def setUp(self):self.f=fixtures.PipelineTests();self.f.setUp();self.root=self.f.root
    def tearDown(self):self.f.tearDown()
    def test_enospc_after_durable_event_before_projection_recovers_once(self):
        s=self.f.task();from spine_skin_tool.repair_store import atomic
        def fail(path,value):
            if path.name=='state.json':raise OSError(errno.ENOSPC,'injected projection write failure')
            return atomic(path,value)
        with patch('spine_skin_tool.repair_store.atomic',side_effect=fail):
            try:advance(self.root,s['id'])
            except OSError:pass
        read(self.root,s['id'])
        with patch('spine_skin_tool.generation.generate_image') as model:r=advance(self.root,s['id'])
        model.assert_not_called();self.assertEqual(r['phase'],'DONE');self.assertEqual(self.f.captures,1);self.assertFalse(r['quality_approved'])
    def test_truncated_event_fails_instead_of_using_stale_projection(self):
        s=self.f.task();p=sorted((directory(self.root,s['id'])/'events').glob('*.json'))[-1];p.write_bytes(b'{truncated')
        with self.assertRaises(ValueError):read(self.root,s['id'])
    def test_expired_login_is_not_sent_and_does_not_spend_a_reservation(self):
        self.f.fake_setup();s=self.f.task(False,live_generation=True);edit_design(self.root,s['id'],self.f.design)
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=False),patch('spine_skin_tool.generation.generate_image') as model:r=advance(self.root,s['id'])
        model.assert_not_called();self.assertEqual(r['status'],'CONFIGURATION_BLOCKED');self.assertEqual(r['initial_image_calls_reserved'],0)
    def test_bad_png_result_is_unknown_and_second_advance_does_not_resend(self):
        self.f.fake_setup();s=self.f.task(False,live_generation=True);edit_design(self.root,s['id'],self.f.design)
        with patch('spine_skin_tool.codex_subscription.login_status',return_value=True),patch('spine_skin_tool.generation.login_status',return_value=True),patch('spine_skin_tool.generation.generate_image',return_value=(b'not a PNG',None)) as model:
            advance(self.root,s['id']);r=advance(self.root,s['id'])
        model.assert_called_once();self.assertEqual(r['initial_image_calls_reserved'],1);self.assertIsNone(r['best_output']);self.assertFalse(r['quality_approved'])
