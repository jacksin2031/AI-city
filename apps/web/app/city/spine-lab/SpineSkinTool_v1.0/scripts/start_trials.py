"""启动保留原头模/耳朵/表情的发型与服装规格试验。"""
from pathlib import Path
import argparse
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from prepare_hair_template import prepare

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--trial-inputs',type=Path);parser.add_argument('--trial-root',type=Path)
    parser.add_argument('--output-root',type=Path);args=parser.parse_args()
    source,atlas,inputs,path=prepare(ROOT)
    work=ROOT/'runtime/work/M04'
    trials=(args.trial_root or work/'candidates-hair-v3').resolve()
    output=(args.output_root or ROOT/'runtime/output/M04/hair-v3').resolve()
    trial_inputs=(args.trial_inputs or inputs).resolve()
    if trial_inputs.is_symlink() or not trial_inputs.is_relative_to(work.resolve()):raise ValueError('UNSAFE_TRIAL_INPUTS')
    if trials.is_symlink() or not trials.is_relative_to(work.resolve()):raise ValueError('UNSAFE_TRIAL_DIRECTORY')
    if output.is_symlink() or not output.is_relative_to((ROOT/'runtime/output/M04').resolve()):raise ValueError('UNSAFE_OUTPUT_DIRECTORY')
    for target in (trials,output):
        target.mkdir(parents=True,exist_ok=True)
    return subprocess.call([sys.executable,'-B',str(ROOT/'scripts/preview.py'),
        '--source',str(source),'--atlas',str(atlas),
        '--parts',str(inputs),'--profile',str(path),'--output-root',str(output),
        '--trial-inputs',str(trial_inputs),'--trial-root',str(trials),'--port',str(args.port)],cwd=ROOT)

if __name__=='__main__':raise SystemExit(main())
