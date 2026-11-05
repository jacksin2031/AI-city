"""User-selected import guards, deduplication, metadata and concurrent publication."""
import io,tempfile,unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from spine_skin_tool.photo_import import import_photo,MAX_BYTES
from spine_skin_tool.design import digest,DesignError

class PhotoImportTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory(prefix='spine photo import ');self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def png(self,color='red'):
        out=io.BytesIO();Image.new('RGBA',(18,24),color).save(out,format='PNG');return out.getvalue()
    def test_import_preserves_archive_and_reuses_existing_pixels_without_overwrite(self):
        content=self.png();a=import_photo(self.root,content);path=self.root/'runtime/work/M04'/a['photo'];before=digest(path);b=import_photo(self.root,content)
        self.assertEqual(a,b);self.assertEqual(before,digest(path));self.assertEqual((self.root/'runtime/work/M07/photo-imports'/(a['original_sha256']+'.bin')).read_bytes(),content);self.assertEqual(a['model_calls'],0)
    def test_other_photo_gets_new_name_and_does_not_replace_existing(self):
        a=import_photo(self.root,self.png());first=self.root/'runtime/work/M04'/a['photo'];before=digest(first);b=import_photo(self.root,self.png('blue'));self.assertNotEqual(a['photo'],b['photo']);self.assertEqual(before,digest(first))
    def test_invalid_and_oversized_images_create_no_work(self):
        for content in (b'not-an-image',b'x'*(MAX_BYTES+1),b''):
            with self.assertRaises(ValueError):import_photo(self.root,content)
        self.assertFalse((self.root/'runtime/work').exists())
    def test_jpeg_orientation_is_applied_and_private_exif_is_not_exported(self):
        out=io.BytesIO();im=Image.new('RGB',(18,24),'red');exif=Image.Exif();exif[274]=6;exif[315]='synthetic private metadata';im.save(out,format='JPEG',exif=exif)
        a=import_photo(self.root,out.getvalue());file=self.root/'runtime/work/M04'/a['photo']
        with Image.open(file) as result:self.assertEqual(result.size,(24,18));self.assertFalse(result.getexif())
    def test_concurrent_different_photos_publish_exclusive_complete_pngs(self):
        with ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda c:import_photo(self.root,c),[self.png('red'),self.png('blue')]))
        self.assertEqual(len({r['photo'] for r in results}),2)
        for r in results:
            with Image.open(self.root/'runtime/work/M04'/r['photo']) as im:im.verify()
