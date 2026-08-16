# 2026-05-25 — Install CANONICAL_STATE_LAYER_DESIGN as data-architecture authority

## What changed
- Relocated `CANONICAL_STATE_LAYER_DESIGN.md` from repo root to `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` so it sits alongside `target_architecture.md`, `current_state.md`, and `ADAPTER_BOUNDARY.md`. Document content unchanged.
- `CLAUDE.md` Step 4 (Required Reads): added the new doc as a conditional required-read for any task touching `core.observations`, `core.visits`, `core.assets`, `core.evidence`, `core.observation_type_registry`, the observation normalizer, or intelligence/MVs that read observation condition. Flagged STATUS as target design, pending §9 verification — direction, not ratified DDL.
- `CLAUDE.md` Core Rules: added a target rule that intelligence and dashboards read the normalized observation columns (`obs_kind` / `norm_status` / `norm_severity`), never observation `payload`. Marked as enforced once the layer is ratified.
- `CLAUDE.md` Labor Safety Guardrails: added a one-line cross-reference to §3.2 of the new doc (identity sidecar + no-grant intelligence role) as the structural mechanism that makes worker non-attribution a permission-layer guarantee rather than a code-review rule.
- `planning/architecture/target_architecture.md` §8: added a "Detailed expansion" pointer naming the new doc as the data-architecture authority for the four canonical nouns, the registry, and the normalized read surface; called out §3.2 and §3.3/§4.3 as the structural mechanisms behind §8's labor-safe / explainable / downstream-of-canonical-state constraints. Status warning preserved (target design, §9 unresolved).

## Why
- Establish a single authority for the canonical state layer's shape (four nouns, observation type registry, normalized columns) before the intelligence layer or any new vertical bakes in assumptions.
- Mirror the conditional-read pattern already used for `ADAPTER_BOUNDARY.md` so the doc is loaded exactly when it governs the work, not as blanket overhead.
- Keep the doc framed as direction-pending-verification (§9 open questions unresolved against the live schema) so no agent treats its DDL as ratified or generates migrations against it.
- Make the labor-safety guarantee structural in documentation as well as in design: §8 of `target_architecture.md` states the constraint; §3.2 of the new doc shows how it is enforced at the DB permission layer.

## Files touched
- `CANONICAL_STATE_LAYER_DESIGN.md` (moved from repo root)
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` (new path)
- `CLAUDE.md`
- `planning/architecture/target_architecture.md`
- `docs/changelog/2026-05-25-canonical-state-layer-authority.md` (this entry)
