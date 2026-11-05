"""Authorized lifetime pool growth retains finite per-job and disabled defaults."""
import json,tempfile,unittest
from pathlib import Path
from spine_skin_tool.generation import defaults,validate_settings
from spine_skin_tool.review_visual import review_settings
from spine_skin_tool.photo_design import settings as design_settings,DEFAULTS
from spine_skin_tool.design import VERSIONS
from spine_skin_tool.pipeline import limits,DEFAULTS as FLOW

class LiveCapacityTests(unittest.TestCase):
    def test_long_lived_counters_can_grow_without_enabling_models_or_removing_job_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'runtime/secrets';folder.mkdir(parents=True)
            cfg=defaults();cfg['max_live_calls']=500;self.assertFalse(validate_settings(cfg,root)['live_enabled'])
            for name,reader in [('review.json',review_settings),('design.json',design_settings)]:
                (folder/name).write_text(json.dumps({**DEFAULTS,'max_live_calls':500}),encoding='utf-8');self.assertFalse(reader(root)['live_enabled'])
            with self.assertRaises(ValueError):limits({**FLOW,'max_image_calls':500})
    def test_noninteger_and_out_of_capacity_pools_still_reject(self):
        for n in [True,0,-1,1.5,VERSIONS['execution']['global_reservation_capacity']+1]:
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);folder=root/'runtime/secrets';folder.mkdir(parents=True);cfg=defaults();cfg['max_live_calls']=n
                with self.assertRaises(ValueError):validate_settings(cfg,root)
                for name,reader in [('review.json',review_settings),('design.json',design_settings)]:
                    (folder/name).write_text(json.dumps({**DEFAULTS,'max_live_calls':n}),encoding='utf-8')
                    with self.assertRaises(ValueError):reader(root)
