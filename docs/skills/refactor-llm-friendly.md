# LLM-Friendly Refactoring

## Why it matters
- Large files waste context and slow down analysis and edits.
- Tight module boundaries make performance ownership and debugging explicit.
- Small, focused files reduce merge conflicts and review risk.
- Deterministic behavior is easier to preserve when responsibilities are isolated.

## What good looks like
- Files are <= 350 lines (absolute max 500) with one primary responsibility.
- Each large file has a mapped split plan before any code move.
- Public APIs remain stable; facades re-export or delegate cleanly.
- New modules use explicit names and minimal cross-dependencies.
- Tests and benchmarks are updated as part of the refactor.
- Documentation reflects the new module boundaries and ownership.

## Refactor checklist
- Identify files over 350 lines and group by responsibility.
- Define target module map and file ownership before moving code.
- Move code in small batches, keeping behavior unchanged.
- Keep a thin facade file for the public surface.
- Update imports and re-exports in one pass per module.
- Run `npm run check` after each split and key tests for affected areas.
- Update `docs/roadmap/refactor-llm-friendly.md` and indices.

## Common failure modes
- Splitting files without a plan, creating circular dependencies.
- Mixing runtime logic and types in the same module post-split.
- Forgetting to re-export types from the facade file.
- Leaving oversized files after "refactor" is declared complete.
- Changing behavior while refactoring without tests or docs.
