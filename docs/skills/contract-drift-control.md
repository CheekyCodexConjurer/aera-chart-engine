# Contract Authoring and Drift Control

## Why it matters
- Contract drift causes silent behavior changes and breaks host workflows.
- Documentation is a first-class artifact for this engine.

## What good looks like
- Every behavioral change updates the relevant contract docs.
- Migration notes exist for any user-visible change.
- Contract diffs are explicit and reviewable.

## Scope boundaries
- Includes public API contract, performance SLOs, and architecture pages.
- Includes migration notes and versioning updates.
- Excludes host-specific UI flows and indicator schemas.

## Evidence and artifacts
- Updated contract docs with version notes.
- Migration note for any breaking or behavior-altering change.
- Checklist showing updated pages: API contract, SLOs, architecture.

## Review questions
- Are all affected contracts updated and linked?
- Is the change documented in a migration note?
- Are implicit behavior changes prevented?

## Common failure modes
- Shipping behavior changes without doc updates.
- Missing migration notes for breaking changes.
- Ambiguous ownership of contract changes.
