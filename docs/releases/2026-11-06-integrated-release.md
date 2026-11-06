# AI City integrated release — 2026-11-06

## Scope

This release consolidates the work from `feat/admin-photo-recovery`, `fix/admin-spine-refresh-20261106`, `feat/admin-ai-dialogue-toggle`, the cloud asset recovery branch, and the reviewed local changes into one release branch based on the latest `main`.

- Photo-generation administration: worker heartbeat, queued/running/review/failed/published tasks, privacy-preserving previews, safe cancellation and explicit cost confirmation for retry, plus preserving the current admin detail during refresh errors.
- Published Spine assets: surface errors without exposing private asset paths, allow participant portrait retry, and continue polling review/failed/unknown tasks so administrative recovery is reflected on the participant page. No generation retries are triggered automatically.
- Tablet: keep saved per-part Spine adjustments, make AI dialogue opt-in from the administrator screen, double the top-left `バーチャル御茶ノ水` scene logo on larger displays (retain the compact size at <=600px), and exclude fictional DEMO residents from the real participant count.
- Participant interface: remove the obsolete square link logo from the top-left header, without removing the photo-flow entry button. Retain the current upstream fix showing the photo-flow entry only on the first page.
- Tests and dependencies: serialize E2E workers that share in-process device state, stabilize synthetic resident fixtures, update the Biome schema, and pin targeted vulnerable transitive dependency versions.
- Format administrator recovery documents and end-to-end test code.

## Cloud deployment and rollback

Target service: `ai-city-web`, project `ai-city-511822`, region `asia-northeast1`. The public URL is `https://ai-city-web-391632496355.asia-northeast1.run.app`; preserve `AI_CITY_PUBLIC_ORIGIN` for this host. Build with `infra/app/Dockerfile` and the existing restricted preview builder account. Test a tagged 0%-traffic revision before shifting traffic; verify the actual app pages and published bundle assets after release.

Prior known-good revision before this integration: `ai-city-web-00021-gib`. Example rollback (only if needed): `gcloud run services update-traffic ai-city-web --project ai-city-511822 --region asia-northeast1 --to-revisions ai-city-web-00021-gib=100`.

Do not change Firestore participant records, storage IAM, private media, secrets, billing, or the separate local generation Worker as part of this web deployment. `REQUIRES_REVIEW` is not an approved character and still needs an administrator decision.

## Verification

- TypeScript, Biome, unit tests, production build, and targeted browser E2E checks are required.
- Cloud smoke checks should include `/join`, `/tablet`, `/admin`, and an already-published Spine bundle's manifest, skeleton, atlas, and first PNG through the canonical URL.
- Real phone/tablet confirmation is still required for visual appearance and pairing; endpoint HTTP 200 alone cannot prove that WebGL renders every avatar.
