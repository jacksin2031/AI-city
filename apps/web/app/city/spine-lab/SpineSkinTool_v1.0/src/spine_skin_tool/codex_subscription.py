"""Official Codex CLI built-in ImageGen with ChatGPT sign-in; never an API fallback."""
import json,contextlib
import os
from pathlib import Path
import shutil
import subprocess
import time

class SubscriptionError(ValueError):
    def __init__(self,code):self.code=code;super().__init__(code)

def clean_environment():
    # Keep Codex's own credential store; do not read/copy OAuth tokens or API keys.
    return {k:v for k,v in os.environ.items() if not k.upper().startswith(('OPENAI_','AZURE_OPENAI_')) and k.upper() not in ('CODEX_API_KEY','XAI_API_KEY','GROK_API_KEY')}

def executable(spec):
    value=shutil.which(spec['executable'])
    if not value:raise SubscriptionError('CODEX_CLI_NOT_FOUND')
    if Path(value).suffix.lower() in ('.cmd','.bat','.ps1'):raise SubscriptionError('CODEX_NATIVE_EXECUTABLE_REQUIRED')
    return value

def login_status(spec):
    try:
        result=subprocess.run([executable(spec),'login','status'],env=clean_environment(),capture_output=True,timeout=15)
        return result.returncode==0 and b'Logged in using ChatGPT' in result.stdout+result.stderr
    except (OSError,subprocess.TimeoutExpired,SubscriptionError):return False


def terminal_usage_limit(job):
    """Recognize a terminal CLI quota error, never infer it from an absent image."""
    path=job/'codex-events.jsonl'
    if not path.is_file():return False
    for line in path.read_text(encoding='utf-8',errors='replace').splitlines():
        try:event=json.loads(line)
        except ValueError:continue
        if not isinstance(event,dict) or event.get('type')!='turn.failed':continue
        error=event.get('error',{});message=str(error.get('message','') if isinstance(error,dict) else error).lower()
        code=error.get('code',error.get('type','')) if isinstance(error,dict) else ''
        if code in ('usage_limit_reached','rate_limit_exceeded','insufficient_quota') or any(s in message for s in ('usage limit','usage_limit','rate limit','quota exceeded')):return True
    return False

def generate_image(spec,prompt,paths,job,session=None,part=None,local_edit=False):
    if not login_status(spec):raise SubscriptionError('CODEX_CHATGPT_LOGIN_REQUIRED')
    job=job.resolve();schema=job/'codex-output-schema.json';last=job/'codex-result.json'
    schema.write_text(json.dumps({'type':'object','properties':{'status':{'type':'string','enum':['GENERATED','UNAVAILABLE','OUTPUT_BLOCKED','RATE_LIMITED']},'image_path':{'type':'string'},'reason_code':{'type':'string','enum':['NONE','TOOL_UNAVAILABLE','TECHNICAL_ERROR','OUTPUT_MODERATION','SUBSCRIPTION_LIMIT','UNKNOWN']}},'required':['status','image_path','reason_code'],'additionalProperties':False}),encoding='utf-8')
    instruction=("$imagegen Produce exactly ONE transparent PNG using the BUILT-IN image_gen tool, using the attached authorised references in the listed order. "
                 +("Use the explicitly named frozen hair PNG as the edit target; the fixed composite is geometry reference. Never use a later attempt as a target. " if local_edit else "Treat those inputs as original references, not edit targets. ")+
                 "Pass the complete asset specification below to ImageGen; do not condense it, beautify it, add detail or replace the requested simple style with your own. "
                 "Call the built-in generator once only. Do not use an API key, HTTP endpoint, CLI/API fallback, browser automation, unauthorised previous generated images, Python drawing or placeholders. "
                 "Do not edit repository files or run tests. If built-in ImageGen is unavailable, return status UNAVAILABLE with an empty image_path; do not substitute another method. "
                 "Report a safety/output block as OUTPUT_BLOCKED with reason_code OUTPUT_MODERATION, and a quota/rate limit as RATE_LIMITED with reason_code SUBSCRIPTION_LIMIT; never disguise either as unavailable. For other unavailability use TOOL_UNAVAILABLE/TECHNICAL_ERROR/UNKNOWN as actually observed, not guessed. Successful generation uses reason_code NONE. "
                 "The built-in ImageGen result has image_url and output_hint fields, not an MCP content array. Read/print ONLY output_hint to obtain the saved absolute PNG filename; never print image_url/base64. An absent content array does NOT mean the tool is unavailable. Return the actual filename from output_hint; do not return an empty path after successful generation. "
                 "After generation return status GENERATED and the absolute actual generated PNG path in image_path. The caller copies that PNG into the job folder. "
                 "Do not claim visual approval.\n\n"+prompt)
    (job/'prompt.txt').write_bytes(prompt.encode('utf-8'))
    command=[executable(spec),'exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json',
             '-c','forced_login_method="chatgpt"','-c','features.image_generation=true','-c','project_doc_max_bytes=0',
             '--cd',str(job),'--output-schema',str(schema),'--output-last-message',str(last)]
    started=time.time();active=time.monotonic()
    try:
        from . import character_session as sessions
        with sessions.lock(session) if session else contextlib.nullcontext():
            state=sessions.begin(session,job,prompt,part) if session else None
            if session:command=sessions.command(executable(spec),session,state,job,schema,last,True)
            for path in paths:command.extend(['--image',str(path.resolve())])
            command.append('-')
            try:
                with (job/'codex-events.jsonl').open('wb') as stdout,(job/'codex-stderr.log').open('wb') as stderr:
                    result=subprocess.run(command,input=instruction.encode('utf-8'),stdout=stdout,stderr=stderr,env=clean_environment(),timeout=spec['timeout_seconds'])
            finally:
                if session:sessions.finish(session,job,job/'codex-events.jsonl',last.is_file() or 'moderation_blocked' in (job/'codex-stderr.log').read_text(encoding='utf-8',errors='replace'))
                (job/'execution-timing.json').write_text(json.dumps({'cli_total_seconds':round(time.monotonic()-active,6),'session_mode':'PER_CHARACTER' if session else 'EPHEMERAL_PER_PART','requested_model':state['requested_model'] if state else 'CLI_DEFAULT_UNVERIFIED','image_model':'BUILTIN_NOT_EXPOSED','image_generation_seconds':None}),encoding='utf-8')
    except subprocess.TimeoutExpired:raise SubscriptionError('CODEX_TIMEOUT_RESULT_UNKNOWN_NO_RETRY') from None
    except OSError:raise SubscriptionError('CODEX_EXEC_FAILED_NO_RETRY') from None
    diagnostic=(job/'codex-stderr.log').read_text(encoding='utf-8',errors='replace')
    if 'moderation_blocked' in diagnostic:raise SubscriptionError('CODEX_OUTPUT_MODERATION_BLOCKED')
    if result.returncode!=0:raise SubscriptionError('CODEX_SUBSCRIPTION_LIMIT_REACHED' if terminal_usage_limit(job) else 'CODEX_EXEC_FAILED_NO_RETRY')
    return collect_image_result(spec,paths,job,started,session=session)


def collect_image_result(spec,paths,job,started,session=None):
    """Harvest an existing returned result without login, generation or resubmission."""
    last=job/'codex-result.json'
    diagnostic=(job/'codex-stderr.log').read_text(encoding='utf-8',errors='replace') if (job/'codex-stderr.log').is_file() else ''
    if 'moderation_blocked' in diagnostic:raise SubscriptionError('CODEX_OUTPUT_MODERATION_BLOCKED')
    try:value=json.loads(last.read_text(encoding='utf-8'))
    except (OSError,ValueError):raise SubscriptionError('CODEX_OUTPUT_INVALID') from None
    if value.get('status')=='OUTPUT_BLOCKED' or value.get('reason_code')=='OUTPUT_MODERATION':raise SubscriptionError('CODEX_OUTPUT_MODERATION_BLOCKED')
    if value.get('status')=='RATE_LIMITED' or value.get('reason_code')=='SUBSCRIPTION_LIMIT':raise SubscriptionError('CODEX_SUBSCRIPTION_LIMIT_REACHED')
    if value.get('status')!='GENERATED':raise SubscriptionError('CODEX_IMAGEGEN_UNAVAILABLE')
    path_value=value.get('image_path','')
    if not path_value and session:path_value=recover_missing_output_path(session,job)
    raw=Path(path_value)
    if not raw.is_absolute() or raw.is_symlink():raise SubscriptionError('CODEX_OUTPUT_PATH')
    path=raw.resolve();home=Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex'))).resolve()
    if not any(path.is_relative_to(area) for area in (home/'generated_images',job)):raise SubscriptionError('CODEX_OUTPUT_PATH')
    if not path.is_file() or path.stat().st_mtime<started-2 or path.stat().st_size>24*1024*1024:raise SubscriptionError('CODEX_OUTPUT_NOT_NEW_IMAGE')
    if path.is_relative_to(job/'references'):raise SubscriptionError('CODEX_OUTPUT_IS_REFERENCE')
    content=path.read_bytes()
    if any(content==p.read_bytes() for p in paths if p.is_file()):raise SubscriptionError('CODEX_OUTPUT_IS_REFERENCE')
    if not content.startswith(b'\x89PNG\r\n\x1a\n'):raise SubscriptionError('CODEX_OUTPUT_NOT_PNG')
    # Output bytes undergo the shared decode/alpha checks before being marked generated.
    return content,None


def recover_missing_output_path(session,job):
    """Find one already-saved output in this serial turn; never resubmit or guess."""
    import re,hashlib
    value=json.loads((session['folder']/'session.json').read_text(encoding='utf-8'))
    if value['flow_id']!=session['flow_id'] or value['photo_sha256']!=session['photo_sha256']:raise SubscriptionError('CODEX_OUTPUT_PATH')
    sid=value.get('session_id','')
    if not isinstance(sid,str) or not re.fullmatch(r'[a-f0-9-]{36}',sid):raise SubscriptionError('CODEX_OUTPUT_PATH')
    identity=job.relative_to(session['root']).as_posix();turn=next((t for t in value['turns'] if t['job']==identity),None)
    if not turn or turn['status']!='RETURNED' or not isinstance(turn.get('finished_at'),(int,float)):raise SubscriptionError('CODEX_OUTPUT_PATH')
    home=Path(os.environ.get('CODEX_HOME',str(Path.home()/'.codex'))).resolve();area=home/'generated_images'/sid
    if area.is_symlink() or not area.is_dir() or not area.resolve().is_relative_to(home/'generated_images'):raise SubscriptionError('CODEX_OUTPUT_PATH')
    images=[p for p in area.glob('*.png') if not p.is_symlink() and p.is_file() and turn['started_at']-2<=p.stat().st_mtime<=turn['finished_at']+2]
    if len(images)!=1:raise SubscriptionError('CODEX_OUTPUT_PATH')
    path=images[0]
    if path.stat().st_size>24*1024*1024:raise SubscriptionError('CODEX_OUTPUT_PATH')
    proof={'reason':'GENERATED_WITH_EMPTY_PATH_UNIQUE_OWN_SERIAL_TURN_OUTPUT','job':identity,'photo_sha256':value['photo_sha256'],'source_result_sha256':hashlib.sha256((job/'codex-result.json').read_bytes()).hexdigest(),'events_sha256':hashlib.sha256((job/'codex-events.jsonl').read_bytes()).hexdigest(),'image_path':str(path),'image_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'turn_started_at':turn['started_at'],'turn_finished_at':turn['finished_at'],'model_calls':0}
    (job/'local-output-path-recovery.json').write_text(json.dumps(proof,indent=2)+'\n',encoding='utf-8')
    return str(path)
