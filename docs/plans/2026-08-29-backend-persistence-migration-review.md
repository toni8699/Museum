# Backend / persistence migration review — archived

Archived 2026-08-31. This review is historical rationale, not current execution truth.

See `docs/archive/plans/2026-08-29-backend-persistence-migration-review.md` for the ratified record.
Current direction lives in `docs/north-star.md`, ownership in `docs/architecture.md`, and status/order in `docs/plans/README.md`.

P15–P18 have shipped; P19 is the next proposed persistence slice. Future asset storage work must serve the shared project-level Asset Registry used by Spatial and future Experience, with Postgres owning stable metadata/project association and R2 owning heavy bytes.
