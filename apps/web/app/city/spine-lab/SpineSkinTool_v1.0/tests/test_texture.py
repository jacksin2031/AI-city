import unittest
from PIL import Image
from spine_skin_tool.texture import normalize_texture,standard_arm

class TextureTests(unittest.TestCase):
    def test_nearly_transparent_outlier_does_not_shrink_main_leg(self):
        im=Image.new('RGBA',(100,200));im.paste((50,60,70,255),(40,30,60,180));im.putpixel((0,0),(1,1,1,1))
        out,m=normalize_texture(im,(30,100))
        self.assertEqual(m['main_alpha_bbox'],(40,30,60,180))
        b=out.getchannel('A').getbbox();self.assertGreater(b[3]-b[1],95)
        self.assertGreaterEqual(m['removed_alpha_fraction'],0)
    def test_standard_arm_keeps_alpha_and_outline_with_explicit_palette(self):
        im=Image.new('RGBA',(3,10),(255,211,191,255));im.putpixel((0,0),(0,0,0,0));im.putpixel((1,0),(60,30,35,140))
        result=standard_arm(im,{'sleeve_color':'#112233','skin_color':'#AABBCC','sleeve_fraction':.7})
        self.assertEqual(result.getchannel('A').tobytes(),im.getchannel('A').tobytes())
        self.assertEqual(result.getpixel((1,0)),(8,15,23,140))
        self.assertEqual(result.getpixel((1,4)),(17,34,51,255));self.assertEqual(result.getpixel((1,9)),(170,187,204,255))
    def test_invalid_style_and_empty_subject_are_rejected(self):
        for style in ({},{'sleeve_color':'red','skin_color':'#AABBCC','sleeve_fraction':.5},{'sleeve_color':'#112233','skin_color':'#AABBCC','sleeve_fraction':float('nan')}):
            with self.assertRaises(ValueError):standard_arm(Image.new('RGBA',(3,10)),style)
        with self.assertRaises(ValueError):normalize_texture(Image.new('RGBA',(4,4)),(8,8))

    def test_warm_skin_line_and_sleeve_line_are_recolored_without_erasing_shape(self):
        im=Image.new('RGBA',(4,10),(255,212,193,255))
        for y in range(10):
            im.putpixel((0,y),(157,107,102,180))
            im.putpixel((1,y),(66,32,39,255))
        result=standard_arm(im,{'sleeve_color':'#33323A','skin_color':'#FFD3BF','sleeve_fraction':.7})
        self.assertEqual(result.getchannel('A').tobytes(),im.getchannel('A').tobytes())
        self.assertEqual(result.getpixel((0,4)),(23,22,26,180))
        self.assertEqual(result.getpixel((0,9)),(157,106,101,180))
        self.assertEqual(result.getpixel((1,9)),(157,106,101,255))
        self.assertNotEqual(result.getpixel((0,9))[:3],result.getpixel((3,9))[:3])
    def test_full_length_sleeve_never_paints_over_the_half_round_hand(self):
        im=Image.new('RGBA',(20,80),(255,212,193,255))
        for y in range(80):im.putpixel((0,y),(157,107,102,180))
        result=standard_arm(im,{'sleeve_color':'#FFFFFF','skin_color':'#FFD3BF','sleeve_fraction':1})
        self.assertEqual(result.getchannel('A').tobytes(),im.getchannel('A').tobytes());self.assertEqual(result.getpixel((10,60))[:3],(255,255,255))
        self.assertEqual(result.getpixel((10,75))[:3],(255,211,191));self.assertEqual(result.getpixel((0,75))[:3],(157,106,101))
