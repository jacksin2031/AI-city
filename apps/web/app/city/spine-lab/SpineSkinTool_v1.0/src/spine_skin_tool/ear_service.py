"""Explicit local photo-ear review and standard-ear augmentation of saved candidates."""
import json,time,uuid
from .design import private_path,require,digest,load_design,photo_path
from .assembly import verify_bundle
from .pipeline_store import read,commit,lease,directory
from . import ear_policy,standard_ears

def apply(root,identity,observed,capture=True):
 from .character_flow import bindings_from_source,assemble_character
 from .review import create_review
 from .review_render import collect_evidence
 with lease(root,identity):
  s=read(root,identity);require(s['mode']=='GENERATE' and s['phase']=='DONE','EAR_PATCH_SAVED_CANDIDATE_REQUIRED');require(not s['quality_approved'] and s['candidates'],'EAR_PATCH_ALREADY_APPROVED')
  observed=ear_policy.observation(observed)
  existing=s.get('standard_ear_patch')
  if existing:
   review=ear_policy.load(root,existing['decision_id']);require(review['observation']==observed,'EAR_PATCH_DIFFERENT_REVIEW')
   if capture and create_review(root,existing['output'],existing['review_id'])['render']['status']=='NOT_RUN':
    report=collect_evidence(root,existing['review_id']);existing.update(capture_status=report['render']['status'],finished_at=time.time());return commit(root,s,'STANDARD_EAR_CAPTURE_RESUMED_NO_MODEL_CALL')
   return s
  decision_id=ear_policy.record(root,s,observed,'USER_AND_PHOTO_REVIEW');decision=ear_policy.load(root,decision_id)
  require(digest(photo_path(root,s['photo']))==load_design(root,s['design_id'])['design']['photo']['sha256'],'EAR_PATCH_PHOTO_CHANGED')
  if not any(x['decision_id']==decision_id for x in s.setdefault('ear_mode_reviews',[])):s['ear_mode_reviews'].append({'decision_id':decision_id,'previous_mode':s.get('ear_mode'),'mode':decision['mode'],'model_calls':0,'at':time.time()})
  if decision['mode']=='HIDDEN':
   s.update(ear_mode='HIDDEN',ear_decision_id=decision_id,ear_stage='HIDDEN');return commit(root,s,'PHOTO_CONFIRMED_HIDDEN_NO_PART_CHANGE')
  base=s['candidates'][-1];source=private_path(root,base['output']);require(digest(source/'export/bundle/build-manifest.json')==base['manifest_sha256'],'EAR_PATCH_BASE_CHANGED');verify_bundle(source/'export/bundle')
  artifact=standard_ears.create_artifact(root,base['output'],decision_id);output=(directory(root,s['id'])/('candidate-standard-ears-'+artifact[:16])).relative_to(root).as_posix();destination=private_path(root,output)
  pending=s.get('pending_standard_ear_patch')
  if pending:require(pending['artifact']==artifact and pending['base_manifest_sha256']==base['manifest_sha256'],'EAR_PATCH_PENDING_CHANGED')
  else:s['pending_standard_ear_patch']={'artifact':artifact,'decision_id':decision_id,'output':output,'base_manifest_sha256':base['manifest_sha256'],'review_id':'review-'+uuid.uuid4().hex,'started_at':time.time()};commit(root,s,'STANDARD_EAR_LOCAL_PATCH_RESERVED_NO_MODEL_CALL')
  pending=s['pending_standard_ear_patch']
  if not destination.exists():
   bindings,_=bindings_from_source(root,s['design_id'],base['output']);assemble_character(root,s['design_id'],bindings,output,auto_fit=True,fit_revision=s['versions']['fit'],ear_artifact=artifact)
  verify_bundle(destination/'export/bundle')
  assembled_at=time.time()
  for raw in (source/'raw').glob('*.png'):require(digest(raw)==digest(destination/'raw'/raw.name),'EAR_PATCH_ORIGINAL_PART_CHANGED')
  candidate={'output':output,'manifest_sha256':digest(destination/'export/bundle/build-manifest.json'),'review_id':pending['review_id'],'kind':'EAR_STANDARD','processing_timing_sha256':digest(destination/'processing-timing.json')}
  create_review(root,output,pending['review_id'])
  s['candidates'].append(candidate);s.update(output=output,best_output=output,best_manifest_sha256=candidate['manifest_sha256'],review_id=pending['review_id'],ear_mode='PARTIAL_BOTH',ear_stage='BOTH_EARS',ear_stop_reason=None,ear_decision_id=decision_id,standard_ear_patch={**pending,'assembled_at':assembled_at,'model_calls':0},quality_approved=False,status='REQUIRES_REVIEW');s.pop('pending_standard_ear_patch',None);commit(root,s,'STANDARD_EARS_ASSEMBLED')
  report=collect_evidence(root,pending['review_id']) if capture else create_review(root,output,pending['review_id']);s['standard_ear_patch'].update(finished_at=time.time(),capture_status=report['render']['status'])
  return commit(root,s,'STANDARD_EAR_CAPTURE_COMPLETED_NO_MODEL_CALL')
