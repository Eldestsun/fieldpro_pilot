# Planning capture — 2026-05-25 session index

Four artifacts came out of this planning conversation. They have different homes
and different "when to action" rules — kept separate deliberately so the
distinctions don't blur.

| Doc | Home | Status / when to action |
|---|---|---|
| `OK_RULE_trash_volume.md` | state-layer ok-rule definitions | DECIDED — encode into registry ok_rule when ok-rules are set (active state-layer work) |
| `INTELLIGENCE_LAYER_DESIGN_QUESTIONS.md` | planning/intelligence-layer/ | DESIGN DIRECTION — inherited by the intelligence workstream after the state layer merges; companion to ISSUE-016 |
| `COMMERCIAL_MODEL_parked.md` | planning/commercial/ | PARKED — do NOT open until a pilot is landing |
| this index | wherever the above land | — |

## The one-line throughline of the session
Binary capture (labor-safe + frictionless) → time turns booleans into rates →
relative self-improving baseline defines "problem stop" → intelligence tiers
(T1 deterministic / T2 explainable rules / T3 ML) lead with explainable T2 to
build trust before the AI → the tier × org-layer grid is a future pricing
surface (parked).

## Still-open, near-term (state layer)
- Set the remaining ok-rules: confirm binary polarity on the ~26 state/presence
  types (mostly obvious); trash decided (see its doc). This is the last active
  state-layer design item before §9 logic verification.
- §9 logic verification (no-grant role, offline validation) closeable in dev;
  backfill + complexity_score recompute logic-verifiable against registry-derived
  fixtures, production runs staged for first field session.
- Dead-code hygiene (arrival functions) — already handled in commit a456fce.
