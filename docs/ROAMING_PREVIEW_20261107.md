# Preview-only expanded Ochanomizu roaming — 2026-11-07

## Scope and source of truth

The map itself is unchanged. All paths use the existing Blender-exported 1 m grid in `apps/web/public/city3d/nav.bin` and snap to already-defined POIs from `packages/city/src/world.ts`. No new roads, bridges, buildings, photo assets or coordinates were invented.

The local roaming candidate bounds expand from Sola City (x -10..120, y 55..150) to x -385..145, y -115..275. This includes the previously implemented JR Ochanomizu station exits, Hijiribashi/Ochanomizubashi, Yushima Seido, Nikolai Cathedral, Kanda River walkway, Meiji University, and hospital. There is **no claim** that the full bounding rectangle is walkable; route validity is checked against the exported grid.

Most trips remain local within 65 m and prefer POIs visible on screen. A deterministic fraction of walking decisions (~1/3) explore existing outlying landmarks. A* validates each proposed path. No teleportation or invented pedestrian ramps were added.

## Navigation safety fixes

- A* now ignores stale heap entries and does not reopen already settled cells; an admissible lower-bound heuristic makes this safe. Previously multiple traversable long-distance paths returned `[]` after hitting the 400,000-expansion budget.
- Route smoothing checks both orthogonal cells before allowing a diagonal crossing, matching A*'s no-corner-cut rule.
- One Sola City plaza landmark and one spawn originally snapped to an isolated 1 m walkable island near (50,100) and could strand a resident; both now use adjacent connected footway cells within the same plaza.
- Repeated visitor spawns are only offset if the resulting cell remains reachable from their original spawn.

## Tests on actual export

`scripts/inspect-roaming-reachability.ts` checked the 790×730 grid and sampled 301,107 cells in the connected component of the first Sola plaza spawn. After repair, the 12 base spawns should all connect. `scripts/inspect-landmark-paths.ts` checks real A* paths among Sola City and landmark origins.

`packages/city/src/roaming.test.ts` verifies repeated visits outside Sola City, destinations inside the candidate district, paths to JR's two entrances, two bridges, Nikolai, Yushima, riverwalk, hospital and Meiji, and densely samples each segment to reject zero-kind blocked cells; paved footway coverage must exceed 60% of samples. It does not replace final tablet visual inspection.

## Deployment hold

**Production was open to visitors from 10:00 JST and MUST remain on `ai-city-web-grace-dd9e0db`.** The Preview Spine Worker is currently performing a separate Muse photograph E2E using VM Codex 0.167.0; **do not deploy any web revision or restart any Worker while that E2E is in progress**. The roaming candidate branch intentionally starts at the currently deployed Preview web commit `43a7953`, before the separate `9cedda5` Codex-host fallback, because Muse has asked to hold that fallback.

Only after Muse confirms the photo E2E is finished and the Preview slot is free: build and deploy the roaming candidate to **`ai-city-link-preview` only**, verify web health, then verify on `/tablet` with motion enabled: residents can depart Sola plaza and reach JR exits / both bridges / Nikolai / Yushima / Meiji via visible streets and ground. Watch for walking through buildings, tracks or the river, stranded residents and unexpected performance regressions. If any issue arises, revert Preview traffic to its previous revision. Obtain explicit owner approval before any production promotion.

Note: no new map assets were required. Known limitations remain: the exported grid distinguishes general walkable surfaces, not formal crossings; camera and resident focus can move independently; offscreen residents may not be visible without panning.
