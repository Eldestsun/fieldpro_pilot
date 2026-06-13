# ISSUE-031 — ADR Design-Question Decisions (DQ-1…DQ-5)

> **Type:** Architectural decision record. Resolves the five open founder design
> questions the ADR (`2026-06-07-issue-031-redesign-adr.md` §7) left for the
> migration-sequence artifact. No code/schema changed here.
> **Date:** 2026-06-11
> **Decided by:** Founder (delegated to architectural reasoning against stated
> project goals — see "Decision frame" below).
> **Unblocks:** the ISSUE-031 migration-sequence artifact (currently MISSING per
> `2026-06-11-live-repo-audit.md` §8c). Four of five DQs are decided outright; DQ-3
> is decided in direction and gated on one live-DB verification before it is
> sized/executed.
> **Companion:** `2026-06-11-issue-031-calibration-decisions.md` (D0–D8, the
> Section-10 calibration). This record is the layer above it: calibration settled
> *what is live*; this settles *how the migration sequences*.

## Decision frame (the constraints every call below was made against)

1. **Scalable canonical** — canonical stays the derived system-of-record with one
   write direction; no vertical vocabulary in core.
1. **Multi-tenant-ready adapters** — the per-vertical boundary must be structural
   (grant-enforceable), not conventional.
1. **100% labor-safe by structure** — the work-attribution clip must land clean and
   independently verifiable; nothing entangles it.
1. **Do not box in the unbuilt surfaces** — no decision may constrain the capability
   structure, intelligence surfaces, or reporting still to be designed.

Where a call had a genuine tradeoff, it was resolved toward *structural over
conventional* and *legible (narrow-blast-radius) migrations over touch-once
bundling* — consistent with the calibration record's D3/D5/D7 and the founder's
standing scope-discipline guard.

-----

## DQ-1 — Adapter namespace → **dedicated `transit.*` schema. DECIDED.**

The six evicted `v_*_transit` views (CANON-1, already settled) land in a dedicated
**`transit.*`** schema, not in `public` tagged as adapter objects. Future
per-vertical translation views follow the same pattern (`parks.*`, etc.).

**Why:** makes CANON-1 enforceable by **schema grant** rather than naming
discipline — core is a schema, each vertical is a schema, separation is a
structural fact visible in `\dn` and impossible to violate by accident. This is
the multi-tenant/multi-vertical boundary made real rather than aspirational. The
views are moving regardless (eviction from core is settled); the only delta is
destination, so the structural option is nearly free *now* and expensive to
retrofit later.

**Serves:** scalable canonical (core schema-isolated from every vertical),
multi-tenant-ready adapters (per-vertical grant scoping).

**Note for the sequence:** `transit` schema does not exist today
(`2026-06-11-live-repo-audit.md` §9a confirms only `core` + `public`). Creating it
is the first structural step of the view-eviction migration. `admin` schema
(separate, for `identity_directory` relocation) is also not-yet-created — same
audit — and is its own move.

## DQ-2 — RLS fail-open→fail-closed → **separate issue, sequenced AFTER 031. DECIDED.**

The fail-open→fail-closed flip (MT-2 / PATTERN-001) is **not** inside ISSUE-031.
It becomes its own tenancy-hardening issue, sequenced immediately after, landed
together with **ISSUE-018** (intelligence_reader wiring) since they touch the same
read paths.

**Why:** it does not block the pilot (single-org; fail-open is safe today), and
folding it in widens 031's blast radius across the risk job, exports, and
Control-Center reads — degrading the verifiability that is the load-bearing
strategic asset. Keep 031 a clean, legible adapter clip.

**Serves:** labor-safe clip lands legible/verifiable; multi-tenant hardening done
deliberately as near-term follow-on, not rushed into the clip.

## DQ-3 — Spine write-back → **adapter→canonical re-translation. DECIDED (direction); GATED on one verification before sizing/execution.**

When the canonical spine (`core.locations` / `core.asset_locations`) becomes the
live read path (Q-A/Q-B, settled), it stays current by **re-translation from the
adapter on change** — canonical remains strictly *derived*. **No direct admin
write path into canonical.**

**Why:** a direct canonical write would create a second write surface into the
system-of-record and break the one-direction flow that makes canonical scalable
and auditable. Adapter stays the single write surface; canonical is always
downstream. This is the only choice consistent with "adapter is ingestion,
canonical is derived."

**The gate (verify before sizing — do NOT execute on assumption):** the *weight*
of this path depends on whether stop geometry / asset-linkage actually changes via
a **live edit path** today, or is **seed/ingestion-only**. The audit shows
`transit_stops` has live *flag* writes (`hotspot`/`compactor`/`has_trash`) — but
those are demoted-vertical operational flags, **not** geometry/asset-linkage. If
geometry/linkage never changes post-seed in practice, the re-translation path is a
thin on-change trigger, not a subsystem.

- **Action:** dispatch a bounded investigation next session — "is there any live
  write path that mutates `transit_stops` geometry (lat/lon) or
  `transit_stops.asset_id` / `transit_stop_assets` linkage after seed? Enumerate
  every such path; change nothing." The ISSUE-024 trigger
  (`sync_transit_stop_primary_asset`, fires on `transit_stops.asset_id`) is the
  prime suspect and is already a known latent defect site (missing `org_id`).
- **Held this session per founder.** Decision is locked; sizing waits on the fact.

**Serves:** scalable canonical (single derived write direction preserved).

## DQ-4 — Clip vs. MV-4 (condition-state promotion) timing → **clip FIRST, promote in fast-follow. DECIDED.**

The work-attribution clip and the promotion of condition-state tables
(`stop_effort_history` / `stop_condition_history` → canonical, MV-4) are
**separate passes**. The clip lands first.

**Why:** same-pass is touch-once but widens one migration's blast radius across the
labor-safety-critical clip *and* the intelligence-substrate promotion. Splitting
lets the clip — the migration the whole labor-safety guarantee rests on — land
clean and independently verifiable, then gives the condition-state promotion (which
*builds* future intelligence/reporting surfaces) its own focused, deliberate pass.

**Serves:** labor-safe clip verifiable in isolation; intelligence/reporting
substrate promoted deliberately rather than as a side effect of an unrelated
migration (i.e. explicitly *does not* limit those surfaces — it gives them their
own pass).

## DQ-5 — Issue boundaries → **confirmed + backfill KNOWN_ISSUES. DECIDED.**

**ISSUE-031 OWNS:** work-attribution clip · spine-inversion read-repoint · view
eviction (into `transit.*`, DQ-1) · Q-C run↔visit linkage hardening · Q-D evidence
write atomicity.

**ISSUE-031 COORDINATES but does NOT own (each its own tracked issue):**

- MT-1 / **ISSUE-013** — org-resolution lowest-id fallback leak
- **DQ-2** fail-closed RLS (new tenancy-hardening issue, with **ISSUE-018**)
- Q-E — uniform sidecar encryption
- Q-F / **ISSUE-028** — audit_reader wiring + export channel move
- MV-2 / **ISSUE-029** — PostGIS / PG15+ bump
- MV-4 / DQ-4 — condition-state promotion (the fast-follow pass)
- **Q-G / D7** — `mcp_readonly` revocation (dispatched now; see companion)

**Carries a real cleanup:** `docs/KNOWN_ISSUES.md` is **missing entries 027–031
entirely** (`2026-06-11-live-repo-audit.md` §13 gap #2) even though the ADR,
inventories, and CLAUDE.md all reference them as existing — the single largest
index gap. **Action:** backfill 027–031 into KNOWN_ISSUES (and add the Q-G/D7
revocation + ISSUE-030 view-grant exposure as tracked items) so every dispatch
references a real ID and the board matches reality.

-----

## State after this record

|DQ  |Decision                                                  |Status                                                                           |
|----|----------------------------------------------------------|---------------------------------------------------------------------------------|
|DQ-1|Dedicated `transit.*` schema for evicted views            |**Decided**                                                                      |
|DQ-2|Fail-closed RLS = separate issue after 031 (w/ ISSUE-018) |**Decided**                                                                      |
|DQ-3|Adapter→canonical re-translation (canonical stays derived)|**Decided (direction); gated on live geometry-write verification before sizing)**|
|DQ-4|Clip first; condition-state promotion fast-follow         |**Decided**                                                                      |
|DQ-5|Issue boundaries confirmed; backfill KNOWN_ISSUES 027–031 |**Decided**                                                                      |

**Migration sequence is now authorable for everything except DQ-3 sizing.** The
DQ-3 geometry-write investigation is the one remaining fact-gather; held to next
session per founder. The Q-G/D7 `mcp_readonly` revocation dispatches now as an
independent standalone migration (does not depend on any DQ).

## Next session opens with

1. DQ-3 geometry-write investigation result (bounded dispatch) → sizes the spine
   write-back path.
1. Author the ISSUE-031 migration-sequence artifact against this record + the
   calibration record (D0–D8).
1. The table-by-table classification can run in parallel — no open gates in front
   of it (calibration record).
