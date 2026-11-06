# AI City Spine preview release — 2026-11-07

## Deployment safety

- Exhibition production: `ai-city-web`. **Do not deploy this patch there until Muse explicitly reports that preview end-to-end testing succeeded.**
- Preview: `ai-city-link-preview`, Firestore namespace `preview-staging-20261107`. Do not use the production namespace `preview-visitors-20261019` for preview testing.
- The two environments currently use the same private GCS bucket `ai-city-511822-spine-photos`, but task IDs and Firestore namespaces are independent. Do not publish private photo objects or reuse task IDs.
- This patch changes **both the web app and VM Worker code**: `scripts/cloud-spine-worker.ts`, `apps/web/lib/spine/cloud-worker.ts`, `jobs.ts` and a new reporter.
- Firestore job schema is strict. New optional timestamps (`queuedAt`, `startedAt`, `preparedAt`, `finishedAt`) are accepted by the new worker; an **old worker cannot parse new jobs**. Update the preview VM worker code before submitting any preview photo task. In production, coordinate the Worker update and web rollout together, **after** Muse passes preview verification.

## Worker preview configuration

Use this branch's exact commit on the VM and the existing toolchain; do not modify production worker directories. Run **one preview worker** with:
- `AI_CITY_VISITOR_NAMESPACE=preview-staging-20261107`
- `AI_CITY_SPINE_PHOTO_BUCKET=ai-city-511822-spine-photos`
- `AI_CITY_SPINE_LOCAL_DIR` set to an absolute, dedicated preview scratch folder outside the repo (not the production scratch folder)
- The existing approved live-model authentication/confirmation variables, kept private; never print API keys
- `node scripts/run-cloud-spine-worker.mjs --live --cap=20 --workers=1`

The preview worker must **not** share a scratch directory/lock with the production worker. Do not start two processes for the same namespace/scratch. Changing a VM worker needs Muse to operate the VM; a web deployment alone does not update the VM.

## What was repaired

- A bad cloud photo read or other unexpected per-task exception previously escaped the poll loop, potentially killing the entire worker. Per-task failures now have counted safe reason codes, and a transient Firestore listing failure no longer terminates the continuous loop.
- The previously ignored `--workers=N` argument now controls the number of poll loops (default 1), protected by one local in-flight set; a scratch-directory lock blocks accidental second processes.
- Priority ordering is queued jobs oldest first. The listing reads only minimal fields; already-cleaned withdrawn records are counted but skipped. Consent, session, photo digest, generation pinning, cancellation and approval gates stay mandatory.
- Idle and stuck conditions now produce privacy-safe periodic diagnostic summaries. There is **no automatic resubmission of paid model attempts**.
- The participant UI no longer displays elapsed-time-derived percent (which misleadingly reached 90% without actual work), or an unsupported 5–10-minute ETA; it shows state-based waiting, running, done or action needed.
- State transitions store timestamps to support real production duration analysis.

## What is deliberately **not** claimed

- **No live photo has yet reached PUBLISHED on this patch.** Muse must verify that before promotion.
- No live time savings have been measured. `--workers=1` remains the conservative initial mode, not parallel per-part model generation.
- Existing Python pipeline already reuses checkpointed completed per-part results, and avoids re-sending unknown paid calls. It separately renders some static guides for each part. Cross-job caching of source materials has **not** been introduced: the current reference asset manifest contains reference-only, commercially restricted items; changing cache behavior without licence review and quality testing is unsafe.
- No Python model/tool implementation files were changed in this patch. The TypeScript Web/Worker and UI files were changed.
- Firestore-only diagnostics cannot identify the exact model call failure without the relevant VM logs, nor prove photo→bundle→publish until Muse runs the preview test.

## Preview acceptance and measurement (Muse)

1. Confirm the preview revision and its `allowed:true` photo intake status, then update the VM preview worker to this exact commit and restart **only the preview worker**.
2. Create one consented test photo job through preview `/join`. Confirm in the preview namespace that `QUEUED` has `photoStorage=CLOUD_PRIVATE`, `photoSha256` (do not expose its value), `photoGeneration` and `queuedAt`.
3. Confirm Worker poll diagnostics show a new `CLAIMED`, no repeating `SKIPPED` reasons, and state transitions `QUEUED → RUNNING → PREPARED → PUBLISHED` or the actual supported state sequence. Confirm result card, admin status and tablet display; no unauthorized publication.
4. If stuck, report only state, reason codes, stage and timestamps, **not** any raw photographs, URLs, tokens, names or digests.
5. Measure `queueWait = startedAt - queuedAt`, `processing = finishedAt - startedAt`, and `endToEnd = finishedAt - queuedAt` from the same task. These are not model-only timing; for model/assembly breakdown combine with checkpoint timing inside the private tool's processing-timing records.
6. Confirm withdraw/cleanup removes private photo data, and repeated jobs cannot claim withdrawn records.
7. Only after Muse confirms preview acceptance should the same image digest be deployed to production, coordinated with the VM production Worker code update.

## Validation record (local, no model calls)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: passed; 613 tests passed, 5 skipped.
- `pnpm --filter @ai-city/web build`: passed.
- Python tool code unchanged; no Python live/integration execution.
- All timing reductions require a real task; do not present estimated savings as measured.
