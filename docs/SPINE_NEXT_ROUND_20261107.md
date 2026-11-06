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
