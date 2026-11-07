# Spine Preview VM worker-only QA / transport hotfix (2026-11-07)

This branch starts at commit 61bdadb (before the **unneeded** 9cedda5 Code Mode host fallback) and does **not** require any Cloud Run web deployment or contracts changes. Production is LIVE: do not restart/update it to test this. All test images in the source suite are synthetic.

## Findings

- Muse's E2E #6 entered `phase=DONE` and Firestore `REQUIRES_REVIEW`, with one generated candidate and no exception. Admin has no approve/publish action; participant confirmation cannot publish this held item. These are intentional fail-closed states, not a complete staff approval workflow.
- `review.hard_checks` records `RAW_ALPHA_OUTLIERS` as `MINOR/UNKNOWN`, **not FAIL**. Its status is `FAIL` only if another `result=FAIL` defect exists. If the VM reports `hard.status=FAIL` with ONLY these UNKNOWN defects, inspect its exact `hard.defects[].code/result` and current source revisions; do not guess or bypass it.
- `aggregate` / `review_is_approved` intentionally require HUMAN review, so relaxing raw alpha alone **will not publish**. No admin approval action currently exists. The preview-only release exception below is separately, explicitly opted in. It is not equivalent to the tool's formally calibrated production approval.

## Worker-side changes

1. `apps/web/lib/spine/tool-live.ts` forwards lower/upper-case HTTP(S)/ALL/NO proxy environment variables to the tool subprocess (plus preview release opt-in and namespace). Does not log credentials or forward unrelated secrets.
2. `.../spine_skin_tool/character_flow.py` catches exactly `EEXIST` or `ENOTEMPTY` on `os.rename` **only** if the prepared plan directory already exists; verifies its canonical request bytes and all reference hashes; keeps original and duplicate staging data. Other errors still propagate.
3. `.../spine_skin_tool/review.py` retains raw SHA-256 provenance, nonempty alpha, alpha background and exact raw→normalized-export pixel validation. It **does not issue alpha-outlier findings on raw ImageGen parts or individual normalized export pages**. Uncalibrated per-part pants palette samples remain diagnostic metrics, with final color and appearance decided from the assembled visual review. Structural corruption, missing parts, stale hashes or incorrect exports still fail.
4. `.../spine_skin_tool/review_render.py` now evaluates the **genuine transparent composited Spine character screenshots** for all 1x captured animation/direction/transition frames. The existing 1.15 bbox ratio threshold now applies to the **assembled character**, not a source texture. True surviving alpha fringe issues appear as `ASSEMBLED_ALPHA_OUTLIERS` (MINOR/UNKNOWN), empty/opaque full-character captures FAIL, and all frame metrics are stored in the SHA-pinned evidence manifest as `assembled-alpha-metrics.json`. Render result includes the revision and the number of verified frame checks. Normal 2x/4x render coverage is unchanged.
5. `scripts/spine_preview_release.py` plus `scripts/run-spine-live-task.py` add a **default-OFF, Preview-namespace-only** integration release gate. The tool's persisted report still says `REQUIRES_REVIEW`; **only the worker result** changes to `READY_FOR_REVIEWED_EXPORT` and `auto_publish=true` if all of these conditions are true:
   - `AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH=1` **and** `AI_CITY_VISITOR_NAMESPACE=preview-staging-20261107`
   - Pipeline DONE, the current candidate/manifest/review match, no errors or stopped ear stage
   - Hard quality PASS **with zero remaining structural defects**, render PASS **with zero defects**, and 20+ actual assembled-alpha frames checked using `assembled-composite-alpha-001` with **zero composite alpha outliers**, plus matching multi-scale render evidence hashes
   - One successful recorded Codex visual review (source CODEX_SUBSCRIPTION), all required checks complete with **Preview-only confidence >=0.80** (the unchanged global policy floor is 0.90), evidence IDs, no visual defects, and no unknown/fail checks; only a permitted skirt-occlusion NOT_APPLICABLE is tolerated
   - The caller already uses `read_review(..., fresh=True)`, pinning photo, design, bundle hashes and policy. The existing publisher still separately revalidates bundle integrity, active session and participant consent.

A failed or absent condition stays `REQUIRES_REVIEW`. This **does not** approve unreviewed jobs or publish earlier UNKNOWN tasks. Actual visual adequacy is not certified by the controlled model calibration: this is an explicit Preview exhibition experiment, not general production release approval.

## VM operator instructions (PREVIEW ONLY)

Wait for current Preview tasks to finish; do not run two workers against one scratch directory. Review the branch diff and update the Preview worker checkout to the exact commit supplied in PR. The required runtime files are:

- `apps/web/lib/spine/tool-live.ts`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/character_flow.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/review.py`
- `apps/web/app/city/spine-lab/SpineSkinTool_v1.0/src/spine_skin_tool/review_render.py` (**new required VM runtime change**)
- `scripts/run-spine-live-task.py`
- `scripts/spine_preview_release.py` (new, must be copied alongside the live runner)

The tracked tool file `.../SpineSkinTool_v1.0/ui/orientation.js` must also exist on the VM; Muse already restored it. This file was never missing in the repository. Do not replace/overwrite runtime asset directories, generated photos, reports, sessions, or completed jobs. Use the Preview worker's own Python virtualenv and its authenticated Codex 0.167.0 PATH, not a second Codex process.

Set `AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH=1` **only in the Preview Spine Worker environment**, confirm the existing `AI_CITY_VISITOR_NAMESPACE=preview-staging-20261107`; do **not** set the flag in the Production worker env. Test only a **fresh, newly consented** Preview photo after the Preview Worker update; do not requeue old held/UNKNOWN tasks.

Expected successful trace: `QUEUED -> RUNNING -> PUBLISHED`, participant card displayed, admin displays published job and public resident, tablet renders character. If held, obtain only safe aggregate state: `hard.status`, `hard.defects[].code/result/severity`, `render.status`, `render.defects[].code/result`, `render.assembled_alpha_frames`, `render.assembled_alpha_outlier_frames`, `visual_call.status`, visual checks PASS/UNKNOWN counts, `ear_stage` and `stop_reason`, not personal photos, prompts, tokens, proxy URLs or raw model output. A held result is **not** proof of a crash.

**Do not deploy any web revision to Production or restart Production Worker.** Do not turn on Preview auto-release for Production; a production-ready staff approval/publish feature needs separate authenticated, consent-bound design and approval.

## 2026-11-07 PC Preview E2E preparation

The Windows owner-PC worker was configured with official Codex 0.167.0 (including codex-code-mode-host.exe), an independent Spine Python venv (Pillow 12.0.0), offline-installed pinned Playwright/Spine dependencies, Chrome for 1x/2x/4x rendering, ADC for ai-city-511822, and dedicated Preview scratch. The Preview job namespace remained preview-staging-20261107. No Production process or Cloud Run revision was changed.

A read-only audit revealed seven old WITHDRAWN records with pending cleanup and one old RUNNING job. Therefore the owner-PC test uses an **extra opt-in CLI flag** `--preview-queued-only` in `scripts/cloud-spine-worker.ts`. It is rejected outside the exact Preview namespace and explicit `AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH=1`. Only new QUEUED cloud-photo jobs enter the worker listing; withdrawn, UNKNOWN and RUNNING tasks cannot be processed or cleaned by this trial worker. The default Worker behavior is unchanged. Both the filtered job-list unit test and actual PC Worker startup/no-queued-job dry run passed.

`review_render.py` selects a platform-appropriate pinned Python interpreter (`.venv/bin/python` on Linux, `.venv/Scripts/python.exe` on Windows), so the VM's assembled-browser capture no longer incorrectly references a Windows-only path.

For Muse's Preview VM **only** the original six runtime files in the earlier list are required. The extra PC-only queued-test filtering also touches `scripts/cloud-spine-worker.ts` and `apps/web/lib/spine/cloud-worker-report.ts`, but the normal VM Worker does not need the extra flag. Keep production untouched. Do not replay prior held or failed jobs.

## Windows Preview automatic-review launcher

`scripts/run-cloud-spine-worker.bat` is the legacy launcher and is NOT the opt-in QA path for this namespace. Use `scripts/run-preview-spine-worker.bat` for the owner PC instead. The launcher sets `AI_CITY_VISITOR_NAMESPACE=preview-staging-20261107` and `AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH=1` only in its own process environment, uses the dedicated private Preview scratch path, and passes `--preview-queued-only --live --cap=20 --workers=1`. It asks for one explicit `YES` on worker startup because model calls may consume subscription quota or incur provider costs; per-job review/publication thereafter is automatic for strictly eligible candidates.

This mode is **not a forced approval**. A job must have participant consent, a current verified bundle, clean hard/render checks, assembled-alpha evidence and a completed confident Codex visual review. Unsafe, incomplete, unknown, withdrawn or older held work is not auto-approved. An already-running Preview worker must be stopped gracefully before starting a second worker against the same scratch directory; the scratch lock is an additional safeguard.

## 2026-11-07 Preview bare-hair / ear-stage repair

A fresh **fictional synthetic** PC Preview E2E reached DONE/REQUIRES_REVIEW without a transport error: initial image generation 6 calls, visual review 1 call, hard PASS, render PASS, 246 render frames, 82 composited-alpha frames with 0 outliers. The visual review reported EAR_OCCLUDED on the two **pre-ear** hair parts; ear_visibility was explicit FAIL. The workflow ended at ear_stage=STOPPED, reason BARE_HAIR_NOT_CONFIRMED. No publication occurred.

The problem was at the **stage boundary**, not a reason to bypass final review. head-alpha-fit-008 had omitted the 007 revision's lower-jaw coverage range (side_end=0.78 rather than 0.90), and hair_stages.stage_gate did not recognize revision 008. Read-only measurement of the same synthetic raw hair and pinned layout yielded an uncovered side run of **0.092369** at 0.90, versus **0.000000** at 0.78. The fixed 008 inherits the lower-jaw interpretation while retaining its independent rear vertical scaling. Its stage gate now recognizes 008, and ignores **only** the expected EAR_OCCLUDED hair defect at BARE_HAIR (not at FRONT_EARS, BOTH_EARS, or final release). Actual fit metrics, all other hair defects, per-ear visibility, explicit FAIL/UNKNOWN and the final Preview release gate remain enforced.

Focused model-free regression tests cover 008 fit-option inheritance, Preview 0.80 stage confidence, bare-stage-only ear defect exception, geometry/blocking hair defects, and two-ear measurements after the ear pass. Older held, withdrawn and UNKNOWN tasks remain untouched; the queue-isolated Worker still only receives new Preview jobs. The synthetic E2E described above was run *before* this fix; do not represent it as a successful auto-publication test.

## Second Preview PC E2E: FIT-008 passed, visual transport blocked

A second newly consented *fictional synthetic* photo E2E completed six image calls and generated an initial candidate with fit-008 metrics: front crown coverage 1.0, central-face occlusion 0.0, side-uncovered run 0.0, rear-head coverage 1.0, head-hair height difference 0.0. Hard and render checks passed. The visual Codex call returned a structured result with two EAR_OCCLUDED defects, but it used [x,y,width,height] coordinates where the validator required [left,top,right,bottom]. It was preserved as ERROR_OR_RESULT_UNKNOWN / VISUAL_BOX and the cloud job became UNKNOWN. **No new model call or retry on that task. No publication.**

Investigation found that the 008 hair-fit revision was absent from additional current-version paths: the flow-manifest ear_stage was not emitted, so visual review saw LEGACY_INTEGRATED rather than the actual BARE_HAIR stage. This triggered inaccurate missing-ear assessment on an intentionally pre-ear candidate. It was also absent from hard hair-coverage validation and the bound head-height guide. All three now include 008.

The review visual prompt now explicitly requires normalized XYXY coordinates. A narrow deterministic compatibility path recognizes an otherwise valid four-number XYWH slip only when both X and Y axes are reversed, converts coordinates to XYXY, and records original/normalized boxes and an exact correction reason under the review's audited normalization metadata. Defect code, severity, confidence, result, and immutable raw-result SHA remain unchanged. Unrecognized or invalid coordinates still fail closed. An actual EAR_OCCLUDED defect therefore cannot become a Preview automatic approval through coordinate correction alone.

The assembler and the hard review now apply the same non-uniform rear vertical-scale field from fit-008, rather than calculating a scale that is not reflected in Spine attachments. Model-free fixture verifies the exported back-hair attachment height changes with back_scale_y while width remains fixed. The standard-reference-ear path still requires uniform exported hair dimensions; a non-unit rear scale may need separate explicit support and remains fail-closed rather than silently altering existing source artwork. Production Cloud Run and Production Worker have not been changed.
