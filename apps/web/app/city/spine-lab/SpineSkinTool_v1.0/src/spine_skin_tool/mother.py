"""Create a non-destructive runtime copy with source head, ears and expression assets."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT=Path(__file__).resolve().parents[2]
from .assembly import PARTS, canonical, make_profile
from .template import inspect_template
from .reference_assets import library_root


def sha(path:Path)->str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(root:Path=ROOT):
    root=root.resolve()
    original=library_root(root)/'ai-city-spineboy-skin-v13/spine-export'
    source_images=library_root(root)/'Chibi-Stickers-4.3/extracted/images/spineboy'
    work=root/'runtime/work/M04/hair-template-v3'
    inputs=root/'runtime/work/M04/inputs-hair-v3'
    profile_path=root/'runtime/work/M04/reference-profile-hair-v3.json'
    for path in (work,inputs):
        if not path.resolve().is_relative_to((root/'runtime/work').resolve()):
            raise ValueError('UNSAFE_HAIR_TEMPLATE_PATH')
    if work.exists() or inputs.exists():
        manifest=work/'preparation-manifest.json'
        if not work.is_dir() or not inputs.is_dir() or not manifest.is_file():
            raise ValueError('HAIR_TEMPLATE_EXISTS_UNVERIFIED')
        record=json.loads(manifest.read_text(encoding='utf-8'))
        for relative,digest in record['files'].items():
            path=(work/relative).resolve()
            if not path.is_relative_to(work.resolve()) or not path.is_file() or sha(path)!=digest:
                raise ValueError('HAIR_TEMPLATE_HASH_MISMATCH')
        profile=make_profile(work/'ai-city-original-template.json',work/'ai-city-original-template.atlas')
        if canonical(profile)!=profile_path.read_bytes().rstrip(b'\n'):
            raise ValueError('HAIR_PROFILE_HASH_MISMATCH')
        for part,spec in profile['parts'].items():
            if part!='BLANK' and sha(inputs/spec['file'])!=sha(work/spec['file']):
                raise ValueError('HAIR_INPUT_HASH_MISMATCH')
        return work/'ai-city-original-template.json',work/'ai-city-original-template.atlas',inputs,profile_path
    if not original.is_dir() or not source_images.is_dir():
        raise ValueError('REFERENCE_SOURCE_MISSING')
    work.mkdir(parents=True)
    inputs.mkdir(parents=True)
    source_json=original/'ai-city-original-template.json'
    source_atlas=original/'ai-city-original-template.atlas'
    source_report=inspect_template(source_json,source_atlas)
    if source_report['defects']:raise ValueError('REFERENCE_TEMPLATE_INVALID')
    shutil.copyfile(source_json,work/source_json.name)
    shutil.copyfile(source_atlas,work/source_atlas.name)
    for page in source_report['pages']:
        shutil.copyfile(original/page,work/page)
    hair_front=work/'ai-city-template-hair-front.png'
    hair_back=work/'ai-city-template-hair-back.png'
    shutil.copyfile(source_images/'hair-front.png',hair_front)
    shutil.copyfile(source_images/'back-hair.png',hair_back)

    data=json.loads(source_json.read_text(encoding='utf-8'))
    skins={skin['name']:skin for skin in data['skins']}
    source_skin=skins['spineboy']['attachments']
    custom=skins['ai-city-original-template']['attachments']
    original_head=copy.deepcopy(source_skin['head-base']['head-base'])
    custom['head-base']['head-base']=copy.deepcopy(original_head)
    custom['head-base']['head-base-back']=copy.deepcopy(original_head)
    for slot in ('ear-l','ear-r'):
        custom[slot]['ear']=copy.deepcopy(source_skin[slot]['ear'])
    custom['hair-front']['hair-front']['path']='ai-city-original-template/hair-front'
    custom['back-hair']['back-hair']['path']='ai-city-original-template/hair-back'
    for slot in ('eye-sparkle-l','eye-sparkle-r'):
        if slot in source_skin and 'eye-sparkle' in source_skin[slot]:
            custom[slot]['eye-sparkle']=copy.deepcopy(source_skin[slot]['eye-sparkle'])
    (work/source_json.name).write_bytes(canonical(data)+b'\n')

    atlas=work/source_atlas.name
    with atlas.open('a',encoding='utf-8',newline='\n') as stream:
        for page,region,size in (
            (hair_front.name,'ai-city-original-template/hair-front',(289,240)),
            (hair_back.name,'ai-city-original-template/hair-back',(315,282)),
        ):
            stream.write(f'\n{page}\n\tsize: {size[0]}, {size[1]}\n\tfilter: Linear,Linear\n\trepeat: none\n')
            stream.write(f'{region}\n\trotate: false\n\tbounds: 0, 0, {size[0]}, {size[1]}\n\toffsets: 0, 0, {size[0]}, {size[1]}\n\tindex: -1\n')

    profile=make_profile(work/source_json.name,atlas)
    for part,spec in profile['parts'].items():
        if part!='BLANK':shutil.copyfile(work/spec['file'],inputs/spec['file'])
    if profile_path.exists():raise ValueError('HAIR_PROFILE_ALREADY_EXISTS')
    profile_path.write_bytes(canonical(profile)+b'\n')
    manifest={
        'profile':'reference_hair_8part_v2',
        'source_json_sha256':sha(source_json),
        'source_atlas_sha256':sha(source_atlas),
        'style_reference_images':{
            'hair_front_sha256':sha(source_images/'hair-front.png'),
            'hair_back_sha256':sha(source_images/'back-hair.png'),
        },
        'geometry':'PRESERVED_UNCALIBRATED',
        'user_reference_photo_copied':False,
        'files':{path.name:sha(path) for path in work.iterdir() if path.is_file()},
    }
    (work/'preparation-manifest.json').write_bytes(canonical(manifest)+b'\n')
    return work/source_json.name,atlas,inputs,profile_path

