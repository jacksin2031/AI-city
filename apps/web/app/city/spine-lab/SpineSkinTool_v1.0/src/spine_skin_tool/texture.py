"""Chat-validated texture preparation; no source-character silhouette mask."""
from PIL import Image,ImageOps
import re,math

def normalize_texture(image,size,threshold=8):
    image=image.convert('RGBA');original=image.getchannel('A');hist=original.histogram()
    alpha=original.point(lambda v:v if v>threshold else 0);image.putalpha(alpha);box=alpha.getbbox()
    if box is None:raise ValueError('TEXTURE_EMPTY_MAIN_SUBJECT')
    crop=image.crop(box);margin=1;fitted=ImageOps.contain(crop,(max(1,size[0]-2),max(1,size[1]-2)),Image.Resampling.LANCZOS)
    output=Image.new('RGBA',tuple(size));output.alpha_composite(fitted,((size[0]-fitted.width)//2,size[1]-margin-fitted.height))
    after=alpha.histogram();mass=sum(v*i for i,v in enumerate(hist))
    return output,{'cleanup_alpha_threshold':threshold,'removed_alpha_fraction':1-sum(v*i for i,v in enumerate(after))/max(1,mass),'main_alpha_bbox':box,'transform':'UNIFORM_FIT_BOTTOM_ANCHOR_NO_REFERENCE_MASK'}


def prepare_texture(image,size,kind='fit'):
    """One raster policy for single-part import and full-character assembly."""
    image=image.convert('RGBA');original=image.getchannel('A')
    if original.getextrema()[0]==255:raise ValueError('OUTPUT_ALPHA_REQUIRED')
    if kind=='standard':
        if tuple(image.size)!=tuple(size):raise ValueError('STANDARD_ARM_SIZE')
        return image.copy(),{'cleanup_alpha_threshold':0,'removed_alpha_fraction':0,'main_alpha_bbox':original.getbbox(),'transform':'PRESERVE_STANDARD_ARM_ALPHA'}
    if kind=='fit':return normalize_texture(image,size)
    alpha=original.point(lambda v:v if v>8 else 0);image.putalpha(alpha);box=alpha.getbbox()
    if not box:raise ValueError('TEXTURE_EMPTY_MAIN_SUBJECT')
    before=original.histogram();after=alpha.histogram()
    metadata={'cleanup_alpha_threshold':8,'removed_alpha_fraction':1-sum(v*i for i,v in enumerate(after))/max(1,sum(v*i for i,v in enumerate(before))),'main_alpha_bbox':box}
    crop=image.crop(box)
    if kind=='hair':
        crop.thumbnail((1400,1400),Image.Resampling.LANCZOS)
        out=Image.new('RGBA',(crop.width+4,crop.height+4));out.alpha_composite(crop,(2,2))
        metadata['transform']='TRANSPARENT_MARGIN_AND_UNIFORM_HAIR_SCALE_NO_REFERENCE_MASK'
    elif kind=='skirt':
        fitted=ImageOps.contain(crop,(size[0]-2,size[1]-2),Image.Resampling.LANCZOS)
        out=Image.new('RGBA',tuple(size));out.alpha_composite(fitted,((size[0]-fitted.width)//2,1))
        metadata['transform']='UNIFORM_FIT_TOP_ANCHOR_NO_REFERENCE_MASK'
    else:raise ValueError('TEXTURE_KIND')
    return out,metadata

def standard_arm(image,style):
    """Recolor Harri fill AND its two outline families without changing alpha/shape."""
    if not isinstance(style,dict) or set(style)!={'sleeve_color','skin_color','sleeve_fraction'}:raise ValueError('ARM_STYLE')
    def rgb(value):
        if not isinstance(value,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value):raise ValueError('ARM_COLOR')
        return tuple(int(value[i:i+2],16) for i in (1,3,5))
    sleeve,skin=rgb(style['sleeve_color']),rgb(style['skin_color']);fraction=style['sleeve_fraction']
    if type(fraction) not in (int,float) or not 0<=fraction<=1:raise ValueError('ARM_SLEEVE_FRACTION')
    output=image.convert('RGBA').copy();pixels=output.load()
    # Original artist palette: sleeve fill/line, skin fill/line. Classifying
    # both outline families avoids painting the warm skin contour flat.
    source_palette=((76,64,70),(66,32,39),(255,212,193),(157,107,102))
    sleeve_line=tuple(round(v*.45) for v in sleeve)
    skin_line=tuple(round(v*ratio) for v,ratio in zip(skin,(157/255,107/212,102/193)))
    # The bottom half-round is the hand, even when a design requests full sleeves.
    # Preserve all previous shorter sleeve lengths and the original artist alpha.
    sleeve_end=min(round(output.height*fraction),max(0,output.height-math.ceil(output.width/2)))
    for y in range(output.height):
        for x in range(output.width):
            r,g,b,a=pixels[x,y]
            if not a:continue
            nearest=min(range(4),key=lambda i:sum((v-c)**2 for v,c in zip((r,g,b),source_palette[i])))
            is_sleeve=y<sleeve_end
            fill,line=(sleeve,sleeve_line) if is_sleeve else (skin,skin_line)
            pixels[x,y]=(*(line if nearest in (1,3) else fill),a)
    return output
