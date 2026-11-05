"""Legacy command compatibility; geometry/raster logic lives only in the shared core.
For frozen-design exports use scripts/character.py assemble.
"""
from pathlib import Path
import sys,json,argparse
ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'src'))
from spine_skin_tool.character import assemble_raw
from spine_skin_tool.design import private_path

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--raw',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--hair',choices=('short','bob','updo'),required=True);parser.add_argument('--skirt',action='store_true')
    parser.add_argument('--arm-source',choices=('standard','generated'),required=True);args=parser.parse_args()
    def work(path):return private_path(ROOT,path.absolute().relative_to(ROOT).as_posix())
    layout=json.loads((ROOT/'templates/chibi-4.3-beta/character-layouts.json').read_text(encoding='utf-8'))['layouts'][args.hair]
    print(json.dumps(assemble_raw(ROOT,work(args.raw),work(args.output),layout,args.skirt,args.arm_source)))
if __name__=='__main__':main()
