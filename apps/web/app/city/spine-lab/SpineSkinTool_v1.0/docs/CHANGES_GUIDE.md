# Per-change log contract

Human-readable: `docs/changes/CHANGELOG.md`. Machine-readable: `docs/changes/entries/<time>-<task-id>.json`.

Each batch of actual changes to a Git working tree must have matching coverage of every file in JSON entries; `CHANGELOG.md` and the machine entry files are metadata excluded from recursive self-listing (the verifier still confirms their existence and Markdown reference).

Run `python scripts/record_change.py --task-id TASK-ID` to generate a **draft**, then read the diff, replace placeholders with actual reason/code/test evidence, run real tests, then run `python scripts/sync_changelog.py docs/changes/entries/<actual>.json` to place the **actual code snippets** in the Markdown log, and validate using `python scripts/verify_changes.py`.

Never claim that a `NOT_RUN` test passed, do not insert secrets or private image bytes in code excerpts, and do not rewrite accepted historical entries. The verifier checks that code excerpts occur in the actual changed source text, but cannot prove semantic test correctness. CI must invoke it after installing Git and Python.

For CI checking committed pull requests use `python scripts/verify_changes.py --base origin/main` after fetching the target branch; checking a clean checkout with no `--base` would not prove the committed change log covers the PR.
