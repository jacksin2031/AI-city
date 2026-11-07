"""A two-pixel rear mask raster edge is not a material missing hair patch."""
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw

from spine_skin_tool.review_render import mask_metrics, preview_rear_mask_calibration


class PreviewRearCoverageTests(unittest.TestCase):
    def test_preview_only_requires_fit008_with_real_coverage(self):
        fit={"revision":"head-alpha-fit-008","metrics":{
            "status":"ESTIMATED_NOT_VISUALLY_APPROVED","rear_head_coverage":0.980377}}
        env={"AI_CITY_VISITOR_NAMESPACE":"preview-staging-20261107",
             "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH":"1"}
        self.assertTrue(preview_rear_mask_calibration(fit,env))
        for alternative in ({}, {**env,"AI_CITY_VISITOR_NAMESPACE":"production"},
                            {**env,"AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH":"0"}):
            self.assertFalse(preview_rear_mask_calibration(fit,alternative))
        production={"AI_CITY_VISITOR_NAMESPACE":"preview-visitors-20261019",
                    "AI_CITY_SPINE_PRODUCTION_AUTO_PUBLISH":"1"}
        self.assertTrue(preview_rear_mask_calibration(fit,production))
        self.assertFalse(preview_rear_mask_calibration(fit,{
            "AI_CITY_VISITOR_NAMESPACE":"preview-visitors-20261019",
            "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH":"1"}))
        self.assertFalse(preview_rear_mask_calibration(
            {**fit,"revision":"head-alpha-fit-007"},env))
        self.assertFalse(preview_rear_mask_calibration(
            {**fit,"metrics":{**fit["metrics"],"rear_head_coverage":0.97}},env))

    def make_frame(self,folder,real_gap=False):
        size=(512,512)
        def mask(name,rectangle=None):
            im=Image.new("RGBA",size)
            if rectangle:ImageDraw.Draw(im).rectangle(rectangle,fill=(255,255,255,255))
            im.save(folder/(name+".png"))
        mask("head",(100,100,299,299))
        mask("hair",(102,102,297,297))
        if real_gap:
            with Image.open(folder/"hair.png") as im:hair=im.copy()
            ImageDraw.Draw(hair).rectangle((170,170,215,215),fill=(0,0,0,0))
            hair.save(folder/"hair.png")
        for name in ("legs","cover","ear-l","ear-r"):
            mask(name)
        Image.new("RGBA",size).save(folder/"frame.png")
        Image.new("RGBA",size).save(folder/"without-l.png")
        Image.new("RGBA",size).save(folder/"without-r.png")
        return {"direction":"back","frame_id":"s1-000","screenshot":"frame.png",
                "masks":{"head":"head.png","hair":"hair.png",
                         "legs":"legs.png","cover":"cover.png",
                         "ear-l":"ear-l.png","ear-r":"ear-r.png",
                         "without-ear-l":"without-l.png",
                         "without-ear-r":"without-r.png"}}

    def test_two_pixel_edge_only_not_real_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)
            frame=self.make_frame(folder)
            old=mask_metrics(folder,frame,False)
            corrected=mask_metrics(folder,frame,True)
            self.assertLess(old["head_coverage"],0.98)
            self.assertGreaterEqual(corrected["head_coverage"],0.98)
            frame=self.make_frame(folder,True)
            damaged=mask_metrics(folder,frame,True)
            self.assertLess(damaged["head_coverage"],0.98)


if __name__=="__main__":
    unittest.main()
