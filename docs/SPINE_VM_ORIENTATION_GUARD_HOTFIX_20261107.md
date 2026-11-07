# Production VM M05 ORIENTATION_GUARD_CHANGED — byte-preserving hotfix (2026-11-07)

## Symptom

VM Production task `spine-086b990a...`, submitted ~15:16 JST, finished
`REQUIRES_REVIEW` ~15:26 JST. Both M05 rounds: `ORIENTATION_GUARD_CHANGED`,
hard `FAIL`, render and Codex visual not run. A second, non-test VM task
`spine-1a0faea0...` was running while this issue was investigated.
**Do not interrupt or edit that in-flight task.**

## Reproduced root cause

The tracked `ui/orientation.js` is **2,302 bytes** and contains **31 CRLF**
line endings. Its exact SHA-256 is:

`3565723247a2be02ca47ee7f9b7321ef0158b6bc85878ed468e9b9c94f7e780b`

`character.py` previously read the immutable guard using `read_text()`
and then wrote it using `write_text()`. On Linux the default newline
translation creates **2,271 LF-only bytes**, SHA-256:

`c48092b4a95ac903ff768478a791a9138ccdde9b59c1326862e8a74bcfcbca2f`

M05 rightly checks `sha256(bundle/orientation.js) == sha256(tool-root/ui/orientation.js)`;
the difference is wholly caused by serialization, not necessarily by a
character pose or hair defect. `assembly.build` already copies the
original bytes with `read_bytes()` before `character.py` overwrote them
with normalized text. PC Windows text writes preserved CRLF, explaining
the cross-platform discrepancy.

## Hotfix

In `src/spine_skin_tool/character.py`, change only the fixed guard copy
to `read_bytes()` / `write_bytes()`. Leave M05 SHA-256 check and quality
gate intact. No Cloud Run/web update is required; this is **only the local
VM Spine Worker runtime code**.

A synthetic no-model end-to-end assembly test deliberately simulates Linux
text-writer behavior on Windows. Before fix: FAIL with LF output. After
fix: PASS with byte-identical guard. A second test proves deliberately
modified guard still produces hard `ORIENTATION_GUARD_CHANGED`. Full
`test_review_integration.py`: **11/11 PASS**.

## VM read-only diagnosis before applying any change

Use the actual VM paths for the tool and scratch:
```sh
sha256sum "$TOOL_ROOT/ui/orientation.js"
# For each existing candidate (do not print original photos or secrets):
find "$TASK_SCRATCH/tool-workspace/runtime/work" -type f \
  -path '*/export/bundle/orientation.js' -exec sha256sum {} \;
```

Expected: root hash `356572...`, generated bundle hash `c48092...`.
If hashes differ from this exact pair, review the bytes/source provenance
before concluding this is the only fault. Do not modify failed candidate
bundles, M05 receipts, manifests, consent, or Firestore states.

## VM rollout safety

1. **Wait until the second Production task reaches a terminal state.**
   Do not hot-swap Python files during any model or review work.
2. Stop only the Muse VM **Production Spine Worker**; keep the separate
   Production Dialogue Worker running.
3. Sync the hotfix Git commit (or just the byte-copy change from its
   `character.py`) into the VM Production tool checkout; preserve VM
   local runtime, Codex credentials, proxy and private scratch.
4. Confirm VM source/guard hashes, and restart one Production Spine Worker
   with existing namespace `preview-visitors-20261019` and
   `AI_CITY_SPINE_PRODUCTION_AUTO_PUBLISH=1`.
5. Submit a **fresh consented synthetic** test photo and verify M05 hard PASS,
   render and visual review actually run, and automatic publication only
   occurs if the independent 0.80 evidence gate and participant consent pass.
6. Do not force-publish or automatically retry prior `REQUIRES_REVIEW` jobs.
   Original failed artifacts can remain for forensic audit.

The PC Preview worker and the Production Cloud Run deployment remain untouched.
