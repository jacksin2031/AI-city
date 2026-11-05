"""合成素材验证装配的真实失败边界；真实母版另由浏览器验收。"""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from spine_skin_tool.assembly import make_profile, build, AssemblyError, decode_order, encode_order, verify_bundle

class AssemblyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='spine assembly ')
        self.root=Path(self.temp.name);self.parts=self.root/'parts';self.parts.mkdir()
        names=['body','head-base','hair-front','back-hair','arm-l','arm-r','leg-l','leg-r','eye-l','mouth','accessory']
        attachments={
            'body':{'body':{'path':'ai-city-original-template/body','width':2,'height':3},'body-back':{'path':'ai-city-original-template/body-back','width':2,'height':3}},
            'hair-front':{'hair-front':{'path':'ai-city-original-template/hair-front','width':2,'height':3}},
            'back-hair':{'back-hair':{'path':'ai-city-original-template/hair-back','width':2,'height':3}},
            'arm-l':{'arm':{'path':'ai-city-original-template/arm','width':2,'height':3},'arm-back':{'path':'ai-city-original-template/arm-back','width':2,'height':3}},
            'arm-r':{'arm':{'path':'ai-city-original-template/arm','width':2,'height':3},'arm-back':{'path':'ai-city-original-template/arm-back','width':2,'height':3}},
            'leg-l':{'leg':{'path':'ai-city-original-template/leg','width':2,'height':3},'leg-back':{'path':'ai-city-original-template/leg-back','width':2,'height':3}},
            'leg-r':{'leg':{'path':'ai-city-original-template/leg','width':2,'height':3},'leg-back':{'path':'ai-city-original-template/leg-back','width':2,'height':3}},
            'accessory':{'blank':{'path':'ai-city-original-template/blank','width':1,'height':1}},
        }
        self.data={'skeleton':{'spine':'4.3.75-beta'},'bones':[{'name':'root'}],'slots':[{'name':n,'bone':'root'} for n in names],'skins':[{'name':'ai-city-original-template','attachments':attachments}], 'animations':{f'movement/{a}-{d}':{'bones':{'root':{'rotate':[{'value':0},{'time':1,'value':10}]}}} for a in ('idle','trot') for d in ('front','back','left','right')}}
        self.source=self.root/'source.json';self.source.write_text(json.dumps(self.data))
        atlas=[]
        for part in ('hair-front','hair-back','body','body-back','arm','arm-back','leg','leg-back','blank'):
            size=(1,1) if part=='blank' else (2,3)
            image=Image.new('RGBA',size,(20,40,80,0 if part=='blank' else 255));image.putpixel((0,0),(0,0,0,0));image.save(self.parts/f'ai-city-template-{part}.png')
            atlas.append(f'ai-city-template-{part}.png\nsize: {size[0]}, {size[1]}\nai-city-original-template/{part}\nbounds: 0, 0, {size[0]}, {size[1]}\n')
        self.atlas=self.parts/'source.atlas';self.atlas.write_text('\n'.join(atlas))
        self.profile=make_profile(self.source,self.atlas)
        self.assertIn('hair-front',self.profile['policy']['back_hide_slots'])
    def tearDown(self):self.temp.cleanup()
    def run_build(self,name='out'):
        return build(self.source,self.atlas,self.parts,self.profile,self.root/name)
    def test_deterministic_and_source_untouched(self):
        before=self.source.read_bytes();a=self.run_build('a');b=self.run_build('b')
        self.assertEqual(a['files'],b['files']);self.assertEqual(before,self.source.read_bytes())
        output=json.loads((self.root/'a/skeleton.json').read_text())
        self.assertEqual(output['bones'],self.data['bones'])
        self.assertEqual(output['skins'],self.data['skins'])
    def test_missing_wrong_size_empty_and_bad_png_rejected(self):
        part=self.parts/'ai-city-template-body.png'
        original=part.read_bytes()
        for content in (b'bad',b''):
            part.write_bytes(content)
            with self.assertRaises(AssemblyError):self.run_build()
        for size,color in (((3,3),(0,0,0,255)),((2,3),(0,0,0,0))):
            Image.new('RGBA',size,color).save(part)
            with self.assertRaises(AssemblyError):self.run_build()
        part.unlink()
        with self.assertRaises(AssemblyError):self.run_build()
        self.assertFalse((self.root/'out').exists())
        part.write_bytes(original)
    def test_stale_profile_and_existing_destination_rejected(self):
        self.run_build()
        with self.assertRaises(AssemblyError):self.run_build()
        self.source.write_text(self.source.read_text()+'\n')
        with self.assertRaises(AssemblyError):self.run_build('new')
    def test_order_roundtrip_and_revision(self):
        names=[s['name'] for s in self.data['slots']]
        order=names[::-1]
        self.assertEqual(decode_order(names,encode_order(names,order)),order)
        with self.assertRaises(AssemblyError):decode_order(names,[{'slot':'body','offset':100}])
    def test_opaque_and_rgb_parts_are_rejected(self):
        target=self.parts/'ai-city-template-body.png'
        for mode,color in (('RGB',(10,20,30)),('RGBA',(10,20,30,255))):
            Image.new(mode,(2,3),color).save(target)
            with self.assertRaises(AssemblyError):self.run_build()
    def test_corrupt_export_and_profile_tampering_are_rejected(self):
        self.run_build()
        (self.root/'out/ai-city-template-body.png').write_bytes(b'broken')
        with self.assertRaises(AssemblyError):verify_bundle(self.root/'out')
        self.profile['parts']['BODY_FRONT']['canvas']=[999,999]
        with self.assertRaises(AssemblyError):self.run_build('tampered')
