"""Fixed-base registration preserves fitted geometry; no real image generation."""
import hashlib,json,unittest
from PIL import Image
import test_head_first as legacy_head
from spine_skin_tool.assembly import canonical
from spine_skin_tool.design import digest,DesignError
from spine_skin_tool.character_flow import assemble_character,bindings_from_directory
from spine_skin_tool.hair_fit import make,validate


class HairTipTests(unittest.TestCase):
 def setUp(self):
  self.f=legacy_head.HeadFirstTests('test_pair_height_is_recorded_on_shared_head_not_canvas');self.f.setUp();self.root=self.f.root;self.base='runtime/work/current-tip-base'
  assemble_character(self.root,self.f.record['design_id'],bindings_from_directory(self.root,self.f.record['design_id'],'runtime/work/raw'),self.base,auto_fit=True,fit_revision='head-alpha-fit-007')
  self.fit=json.loads((self.root/self.base/'export/bundle/hair-fit.json').read_text());folder=self.root/'runtime/work/M08/hair-tip-references';folder.mkdir(parents=True)
  v={'part':'HAIR_FRONT','design_id':self.f.record['design_id'],'base_output':self.base,'base_manifest':digest(self.root/self.base/'export/bundle/build-manifest.json'),'raw_sha256':digest(self.root/self.base/'raw/HAIR_FRONT.png'),'references':[]};self.identity=hashlib.sha256(canonical(v)).hexdigest();(folder/(self.identity+'.json')).write_bytes(canonical(v))
 def tearDown(self):self.f.tearDown()
 def resolved(self,image):
  p=self.root/'runtime/work/edited.png';image.save(p);paths={'HAIR_FRONT':p,'HAIR_BACK':self.root/self.base/'raw/HAIR_BACK.png'};return {k:{'content':v.read_bytes(),'sha256':digest(v)} for k,v in paths.items()},paths
 def test_edit_is_uniformly_registered_and_revalidated_against_same_base(self):
  image=Image.open(self.root/self.base/'raw/HAIR_FRONT.png').convert('RGBA');a=image.getchannel('A');a.paste(0,(0,image.height-10,image.width,image.height));image.putalpha(a);resolved,paths=self.resolved(image)
  value=make(self.root,self.f.record,resolved,revision='head-alpha-fit-007',tip_artifacts={'HAIR_FRONT':self.identity})
  self.assertAlmostEqual(value['layout']['top'],self.fit['layout']['top']);self.assertAlmostEqual(value['layout']['front_width'],self.fit['layout']['front_width']);self.assertEqual(validate(self.root,self.f.record,value,paths),value['layout'])
 def test_nonuniform_canvas_stretch_and_base_tampering_are_rejected(self):
  image=Image.open(self.root/self.base/'raw/HAIR_FRONT.png').convert('RGBA');resolved,_=self.resolved(image.resize((image.width+40,image.height)))
  with self.assertRaisesRegex(DesignError,'CANVAS_REGISTRATION'):make(self.root,self.f.record,resolved,revision='head-alpha-fit-007',tip_artifacts={'HAIR_FRONT':self.identity})
