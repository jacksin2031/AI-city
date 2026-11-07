# Production Spine auto-publication — 2026-11-07

## Decision / scope

Owner authorizes production web release and VM-hosted Spine automatic publication.
Production namespace is `preview-visitors-20261019`; Preview remains
`preview-staging-20261107`. The PC MUST NOT start a production Spine or
Dialogue Worker. PR #69 provides the previously tested Spine Tool fixes.

## Quality release gate

- `scripts/spine_preview_release.py` requires exact namespace and a separate opt-in flag:
  Preview `AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH=1`; Production
  `AI_CITY_SPINE_PRODUCTION_AUTO_PUBLISH=1`.
- Hard and render status must both be PASS, with zero defects, verified rendered
  alpha evidence, matching manifest/review/evidence hashes and a completed single
  Codex visual-review record. Every required applicable visual check must be PASS
  with confidence >=0.80 and evidence IDs. FAIL and UNKNOWN are NOT accepted.
  `skirt_occlusion` alone may be NOT_APPLICABLE as before.
- The internal Spine Tool review remains REQUIRES_REVIEW; the distinct release
  decision is derived from recorded evidence and does not modify that review.
- The cloud worker's `SpineJobs.publish` validates the manifest/assets and,
  in a Firestore transaction, re-checks the stored participant automatic
  publication consent, active publication consent and session. Withdrawn jobs
  cannot publish.
- The fit008 2px raster-edge compensation now applies in either opted-in namespace,
  only with audited >=98% real geometric coverage; real HAIR_COVERAGE gaps still fail.

## Muse VM — production worker handoff

**Preferred:** sync the ENTIRE tracked release commit to the VM's production
checkout, not an ad-hoc subset. Keep VM-specific `runtime/python/.venv`, Codex
login, bundled reference assets, proxy settings, credentials and private scratch.
Do not overwrite those with the PC's private runtime. Important changed runtime
files (relative to PR #69 base/main):

- `scripts/cloud-spine-worker.ts`
- `scripts/prepare-spine-tool-task.py`
- `scripts/check-spine-references.py`
- `scripts/spine-reference-preflight.ts`
- `scripts/run-spine-live-task.py`
- `scripts/spine_preview_release.py`
- `scripts/run-cloud-spine-worker.bat` (sets Production flag)
- `apps/web/lib/spine/cloud-worker-report.ts`
- `apps/web/lib/spine/jobs.ts`
- `apps/web/lib/spine/tool-live.ts`
- `apps/web/lib/spine/tool-prepare.ts`
- `apps/web/lib/spine/worker.ts`
- `apps/web/lib/visitor/firestore.ts`
- `packages/contracts/src/spine.ts`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/character.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/character_flow.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/hair_fit.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/hair_stages.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/pipeline.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/review.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/review_render.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/review_visual.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/standard_ears.py`

The other changed files (including source-adjacent tests and the read-only
`scripts/restore-missing-spine-references.py`) should also be synced via Git.
Do NOT invoke the Preview-only reference restorer against Production.

Required VM production environment:

```text
AI_CITY_VISITOR_NAMESPACE=preview-visitors-20261019
AI_CITY_SPINE_PRODUCTION_AUTO_PUBLISH=1
AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH=0
AI_CITY_SPINE_PHOTO_BUCKET=ai-city-511822-spine-photos
AI_CITY_SPINE_LOCAL_DIR=<ABSOLUTE_VM_PRIVATE_SCRATCH_DIRECTORY>
AI_CITY_SPINE_LIVE_CONFIRM=I_AUTHORIZE_REAL_MODEL_CALLS
GOOGLE_CLOUD_PROJECT=ai-city-511822
```

Preserve other pre-existing VM-specific transport/proxy variables. Start
`node scripts/run-cloud-spine-worker.mjs --live --cap=20 --workers=1`
from the production checkout, WITHOUT `--preview-queued-only`. Before E2E,
verify worker heartbeat in
`visitorExhibitions/preview-visitors-20261019/meta/spine-worker`, and make
sure no other Production Spine Worker is concurrently claiming jobs.
Dialogue Worker does not require an environment change.

## Separate character-card issue

For Preview test resident `spine-a0ace6c8-eebe-4247-9108-b66afea925f9`,
Firestore confirms PUBLISHED, bundle present, active session and roster, but
the profile has no personalityLabel or traits (questionnaire skipped).
`apps/web/app/join/spine-flow.tsx` renders the phone
`ParticipantCard` only when both shownLabel and shownTraits are non-null,
so no phone card is shown in this case. This is a separate UI/data omission,
not a release-gate or asset-publication issue. The card is expected below the
completion heading on `/join`; on a paired live `/tablet`, the visitor
profile appears when a character is selected. Physical display is not yet
independently verified here. Fix the skip-question fallback separately,
without fabricating personality results.

## Verification / rollback

The Python release-gate tests, scoped Spine Tool tests, full Vitest suite,
TypeScript typecheck, Next.js production build and changed-TS Biome check
pass before deployment. Record the Cloud Run revision, smoke-test a
tagged 0%-traffic revision before routing 100% and retain prior
`ai-city-web-grace-dd9e0db` for rollback.
