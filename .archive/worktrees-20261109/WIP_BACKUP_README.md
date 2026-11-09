# Uncommitted worktree snapshots for 2026-11-09

This commit is a Git-only archival DAG, not an application integration and
not for merging directly into main. It preserves the commit graph of all
branches and includes one snapshot commit per dirty worktree in the parent list.

Each snapshot includes tracked diffs, deletions and non-ignored untracked files.
Ignored files (build outputs, node_modules, local secrets, .venv, .next etc.)
are NOT stored here. Only remove a local worktree once excluded data has
been separately assessed. GitHub upload is verified by ref and SHA.

Project: aicity
Total worktree WIP snapshots: 14
