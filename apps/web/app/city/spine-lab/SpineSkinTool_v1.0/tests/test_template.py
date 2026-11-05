import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from spine_skin_tool.template import inspect_template

class TemplateTests(unittest.TestCase):
    def test_spine43_name_and_default_skin_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            data={'skeleton':{'spine':'4.3.75-beta'},'bones':[{'name':'root'}],'slots':[{'name':'body','bone':'root'}],'skins':[{'name':'default','attachments':{'body':{'base':{'type':'mesh','name':'image'}}}},{'name':'test','attachments':{'body':{'body':{'type':'linkedmesh','source':'base','name':'image'}}}}]}
            (root/'rig.json').write_text(json.dumps(data))
            (root/'rig.atlas').write_text('page.png\nsize: 10, 10\nimage\nbounds: 0, 0, 10, 10\n')
            (root/'page.png').write_bytes(b'\x89PNG\r\n\x1a\n'+b'\0'*8+struct.pack('>II',10,10))
            report=inspect_template(root/'rig.json',root/'rig.atlas')
            self.assertEqual(report['defects'],[])
            self.assertEqual(report['mappings'][1]['mesh_source'],['default','body','base'])
    def test_missing_page_region_version_and_link_cycle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'rig.json'
            data = {'skeleton': {'spine':'4.3.75-beta'}, 'bones':[{'name':'root'}], 'slots':[{'name':'body','bone':'root'}], 'skins':[{'name':'default','attachments':{'body':{'body':{}}}}], 'animations':{}}
            (root/'rig.atlas').write_text('page.png\nsize: 10, 10\nother\n bounds: 0, 0, 10, 10\n')
            source.write_text(json.dumps(data))
            codes = lambda: {d['code'] for d in inspect_template(source, root/'rig.atlas')['defects']}
            self.assertIn('MISSING_ATLAS_PAGE', codes())
            self.assertIn('MISSING_REGION', codes())
            data['skeleton']['spine']='4.2.0'
            data['skins'][0]['attachments']['body']['body']={'type':'linkedmesh','parent':'body'}
            source.write_text(json.dumps(data))
            self.assertIn('RUNTIME_VERSION_MISMATCH', codes())
            self.assertIn('LINKEDMESH_CYCLE', codes())

    def test_atlas_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'rig.json').write_text('{"skeleton":{"spine":"4.3"}}')
            (root/'rig.atlas').write_text('../outside.png\nsize: 1, 1\n')
            self.assertIn('UNSAFE_PAGE_PATH', {d['code'] for d in inspect_template(root/'rig.json',root/'rig.atlas')['defects']})
