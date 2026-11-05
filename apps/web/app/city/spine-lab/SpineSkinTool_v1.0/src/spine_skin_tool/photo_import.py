"""Explicit local photo import; bounded decode, orientation, no source overwrite/upload."""
import hashlib,io,os,uuid
from PIL import Image,ImageOps
from .design import private_path,require,digest
from .pipeline_store import atomic
from .generation import image_bytes,character_references

MAX_BYTES=24*1024*1024


def normalized(content):
    image_bytes(content)  # Shared size/pixel/format/decode guards before any work is written.
    with Image.open(io.BytesIO(content)) as source:image=ImageOps.exif_transpose(source).convert('RGBA')
    image.info.clear();return image


def import_photo(root,content):
    require(isinstance(content,bytes) and 0<len(content)<=MAX_BYTES,'PHOTO_IMPORT_SIZE')
    image=normalized(content);pixel_hash=hashlib.sha256(str(image.size).encode()+image.tobytes()).hexdigest()
    output=io.BytesIO();image.save(output,format='PNG');png=output.getvalue();require(len(png)<=MAX_BYTES,'PHOTO_IMPORT_SIZE')
    archive=private_path(root,'runtime/work/M07/photo-imports');archive.mkdir(parents=True,exist_ok=True)
    source_hash=hashlib.sha256(content).hexdigest();original=archive/(source_hash+'.bin')
    stage=archive/('.source-'+uuid.uuid4().hex+'.tmp')
    with stage.open('xb') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
    try:
        try:os.link(stage,original)
        except FileExistsError:require(digest(original)==source_hash,'PHOTO_IMPORT_ARCHIVE_CHANGED')
    finally:stage.unlink(missing_ok=True)
    work=private_path(root,'runtime/work/M04');work.mkdir(parents=True,exist_ok=True);name=None
    for candidate in character_references(root):
        try:
            with Image.open(work/candidate) as source:
                if source.getexif().get(274,1)!=1:continue
            existing=normalized((work/candidate).read_bytes());identity=hashlib.sha256(str(existing.size).encode()+existing.tobytes()).hexdigest()
            if identity==pixel_hash:name=candidate;break
        except (ValueError,OSError):continue
    if name is None:
        temporary=work/('.photo-import-'+uuid.uuid4().hex+'.png')
        with temporary.open('xb') as stream:stream.write(png);stream.flush();os.fsync(stream.fileno())
        try:
            for i in range(1,10001):
                candidate='character-reference'+str(i)+'.png'
                try:os.link(temporary,work/candidate);name=candidate;break
                except FileExistsError:continue
            require(name is not None,'PHOTO_IMPORT_NAME_LIMIT')
        finally:temporary.unlink(missing_ok=True)  # Only this newly created, private temporary file.
    receipt={'photo':name,'photo_sha256':digest(work/name),'original_sha256':source_hash,'pixel_sha256':pixel_hash,'canvas':list(image.size),
        'source':'USER_SELECTED_ORIGINAL_PHOTO','orientation':'EXIF_TRANSPOSE_ON_IMPORT','metadata':'STRIPPED_FOR_NEW_PNG','model_calls':0}
    atomic(archive/(source_hash+'.json'),receipt);return receipt
