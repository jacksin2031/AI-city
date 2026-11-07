# Spine Preview follow-up — 2026-11-07

## Deployment boundary

- Preview only: `ai-city-link-preview` / visitor namespace `preview-staging-20261107`.
- Do not deploy to `ai-city-web` during the live exhibition. The accepted production revision is `ai-city-web-grace-dd9e0db`.
- This branch contains Worker source changes. The **Preview VM Worker must be updated to the exact PR head** before the next photo attempt. Never run a second Worker against the same namespace and scratch directory.
- Preserve all prior photos, scratch folders and tool outputs. Never use `git clean` or force checkout; no manual permanent deletion.

## Reproduced no-model bug and repair

Using a synthetic PNG (not a participant image), `prepare-spine-tool-task.py` first returned PREPARED/exit 0, then the **same task** returned NOT_PREPARED/exit 1. The original script unconditionally called `workspace.mkdir` without `exist_ok`, then ignored the FileExistsError.

After this patch, both attempts returned PREPARED/exit 0 with the **same flow ID**, without model calls. A separately created empty existing `tool-workspace` also completed and successfully resumed. The fix verifies the exact receipt, photo SHA and saved flow, and never clears or overwrites prior files; incomplete work is recovered only when no live receipt exists. It is still fail-closed on mismatched assets or receipts.

## Diagnostics now available on a new failed task

- Admin task detail may show `failureCode` from a strict, privacy-safe allowlist (e.g. `PREPARE_WORKSPACE_FAILED`, `PREPARE_REFERENCE_FAILED`, `PREPARE_PHOTO_FAILED`, `PREPARE_FLOW_FAILED`, `MODEL_LOGIN_REQUIRED`, `MODEL_QUOTA_REACHED`, `TOOL_LIVE_EXIT`, `TOOL_PIPELINE_FAILED`).
- Python preparation failures return only a bounded stage, not private exception strings. Runtime failures return a static model error classification. Model stderr, private paths, names, tokens, digests and photo content are not logged or sent to the browser.
- A Python nonzero exit with a well-formed failure envelope is no longer discarded as an opaque exception.
- An unfinished, stale, blocked, or result-unknown pipeline cannot be classified as reviewable or auto-published. It stays UNKNOWN until safely resolved. **No automatic model resend**.

## Suggested Muse Preview checks

1. Load a fresh /join session and confirm no persistent red `接続を確認できませんでした` banner on a normal first visit.
2. With Preview Worker running and photo gate open, submit a new consented synthetic/approved photo, track QUEUED > RUNNING and the actual terminal state, then check /join result and /admin detail. Record only state transitions, elapsed timings, safe `failureCode` and private Worker diagnostic categories; do not share photos or credential values.
3. Open the admin Spine panel with an active job and verify the status/detail responds within the client request deadline. Compare against the baseline three timeouts.
4. If a job becomes UNKNOWN, report the exact displayed **safe** failureCode and whether the VM's preview Worker used this PR head; do **not** blindly retry or delete any local tool files.
5. Tablet count remains under investigation. Test with a genuinely paired, actively polling /tablet; at the same moment compare /admin pairedDisplays/connectedDisplays and the persisted session roles (counts only). The historical post-test Preview store held one admin and zero DISPLAY sessions, which does not prove what existed during the original failure.
6. Confirm the already-accepted PR #66 offline/online photo gate and nickname > preset join still work.

**Not yet proven:** the real live model pipeline completing photo-to-PUBLISHED. Do not report full generation as fixed until Muse's end-to-end Preview test actually completes.

## 2026-11-07 08:57 JST Preview E2E reference failure

- New Preview job ended UNKNOWN with `PREPARE_REFERENCE_FAILED` ~3 seconds after Worker claim, before any tool-workspace or model call. The participant image remains private; do not download it for debugging.
- This code means `verify_bundled(tool)` failed **before** preparation. Local branch verifies 221 manifest assets (no missing bytes/hash mismatches/links). The actual Preview VM checkout is not accessible from the connected desktop and must be tested on the VM itself.
- New **read-only** diagnostic `scripts/check-spine-references.py` prints only aggregate counts and static reason code. Use the Preview Worker virtualenv Python interpreter: `python -B scripts/check-spine-references.py` from the Preview checkout (no photo/model/credential access).
- If and **only if** the diagnostic confirms absent tracked references, the Preview branch includes `scripts/restore-missing-spine-references.py`. It requires the exact `fix/spine-next-round-20261107` branch, explicitly set `AI_CITY_VISITOR_NAMESPACE=preview-staging-20261107`, and `--restore-missing`. It reads Git HEAD blobs, validates hashes and lengths against the pinned manifest and uses exclusive-create only; **never overwrites, deletes or follows links**. It fails closed if existing files differ.
- If missing references prevent the new Worker from starting, the preflight will log a safe code then fail before its first heartbeat. The already-deployed 120-second photo-off fallback will protect participants, and nickname+preset participation remains available.
- Do not patch or restart Production or its Worker; do not blindly requeue old UNKNOWN tasks.

### Verified synthetic recovery and VM sequence

- A fresh synthetic sparse checkout (no reference files, no photos) returned `REFERENCE_MANIFEST_MISSING` before repair, then `{"status":"READY","restored_files":223,"model_calls":0}` after explicit Preview-only repair, followed by `{"status":"READY","code":"NONE","expected_files":221,"missing_files":0,"sha_mismatches":0,"links":0}` from the read-only checker. No existing files were replaced or deleted.
- The Preview Worker startup now runs the same read-only integrity check **before** acquiring its scratch-directory process lock or opening Firestore, and refuses to issue heartbeat if references are broken.
- Update only the Preview Worker checkout after existing Preview tasks are idle; do not modify shared Production `node_modules` or Production Worker. First run `python -B scripts/check-spine-references.py` with the Preview Worker virtualenv.
- **Only if** the result confirms missing references and the worktree is exactly branch `fix/spine-next-round-20261107`, explicitly set `AI_CITY_VISITOR_NAMESPACE=preview-staging-20261107`, then run `python -B scripts/restore-missing-spine-references.py --restore-missing`. Immediately rerun the read-only checker and require `READY`.
- If the checker finds a hash mismatch, symlink/junction, malformed manifest, or dependency/runtime error, **do not run repair**; retain existing files and report the safe code. No model photo retry until the environment passes verification.
