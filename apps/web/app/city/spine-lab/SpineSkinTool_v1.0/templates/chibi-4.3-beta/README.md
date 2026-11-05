# Chibi 4.3-beta profile source record

`observed-baseline.json` remains an immutable record of the older `legacy_reference_8part` setup; its generated full-head images are not inputs to the current hair-only profile.

The experimental `reference_hair_8part_v2` profile, template revision `reference-hair-pants-8part-v3`, is prepared into ignored `runtime/work/M04/hair-template-v3/` from the adjacent v13 template skeleton plus read-only original Spineboy head/ear/hair assets. Its `HAIR_FRONT/BACK` outputs replace hair slots only; the runtime hides `hair-front` when facing back. The original head base, ears, and face-expression attachments remain source assets. The runtime preparation script never edits the original library.

Raw-image and attachment measurements are documented in `docs/REFERENCE_PIXEL_MEASUREMENTS.md`; they do not approve final production sizes. Keep generator resolution, exported canvas, and Spine geometry/anchors separate in all future trials.
