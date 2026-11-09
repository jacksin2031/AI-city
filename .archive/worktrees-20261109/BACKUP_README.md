# Worktree Git backup – 2026-11-09

This is a preservation branch; not a deployable integration of changes.

Its commit has every local branch tip and every registered worktree HEAD as a parent,
so pushing this branch makes those commits and their ancestors reachable in the
private GitHub repository without changing main or any original worktree.

WIP, untracked and ignored files are NOT in this version of the preservation commit.
These require separate, reviewed snapshots before local worktrees may be removed.

Repository kind: aicity
Remote main at backup: 4866ac783b064188b3b1c9a99501b265dce05985
Local branch tips: 74
Registered worktree heads: 51
Distinct ancestor parents: 80

Avoid merging this many-parent archive commit into production main.
