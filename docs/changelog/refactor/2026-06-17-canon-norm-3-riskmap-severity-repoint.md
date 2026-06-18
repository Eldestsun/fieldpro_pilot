# 2026-06-17 — CANON-NORM-3: repoint riskMapService hazard severity to real norm_severity

## What changed

### Reader repoint — `backend/src/intelligence/riskMapService.ts` (`rebuildStopRiskSnapshot`)
- **Hazard severity** now READS the real normalized magnitude from the §4.3 read seam
  `core.v_observation_normalized.norm_severity` — `rebuildStopRiskSnapshot` is the
  **first real reader** of that view. The synthesized flat `1.0::numeric(4,2) AS
  last_hazard_severity` is gone.
  - The `haz` CTE now sources `FROM core.v_observation_normalized o` and resolves the 8
    pinned safety presence types via `JOIN core.observation_type_registry r ON r.id =
    o.type_id` (the seam exposes `type_id`, not `observation_type`). Same hazard
    definition as before, sourced canonically.
  - `DISTINCT ON (stop) … ORDER BY observed_at DESC` keeps `last_hazard_at` /
    `hazard_days_ago` = the most-recent hazard (matching the old `MAX(observed_at)`) and
    pairs **that row's** magnitude as `last_hazard_severity`.
  - **Read-the-column discipline:** `norm_severity` is treated as an OPAQUE `0..N`
    magnitude. There is no low/medium/high logic, no `1/2/3` category→number map, and no
    assumption about the scale's range or spacing. `safety_score` just multiplies the
    pre-existing `HAZARD_BASE_WEIGHT` by the magnitude, so any future re-encoding by
    INTEL-SEVERITY-WEIGHTING is inherited automatically.
- **NULL handling** (`COALESCE(o.norm_severity, 1)` inside the `haz` CTE): every row the
  CTE produces is a present hazard, so a present-but-unmagnituded hazard floors to the
  **multiplicative identity `1`** — "still counts as a hazard, no magnitude multiplier."
  The `1` is the identity element of the `BASE * severity` product, **not** a
  severity-scale literal; it is encoding-independent. The "no hazard at all" case stays
  the downstream LEFT-JOIN miss (`COALESCE(h.last_hazard_severity, 0)` → 0). A
  NULL-magnitude hazard is therefore never silently zeroed or dropped.
- **Infrastructure score — deliberately NOT repointed.** Infra has no canonical severity
  magnitude today (every infra presence row has `norm_severity` NULL; CANON-NORM-2). The
  `COUNT(*)`-capped-at-5 presence proxy is **preserved byte-for-byte**. Swapping it for a
  magnitude read would collapse the infra signal to zero — a scoring/weighting decision
  that is NOT state's to make. Per CANON-NORM-3's stop condition this is **flagged for
  INTEL-SEVERITY-WEIGHTING**, not decided here.
- The **legacy** `rebuildStopRiskSnapshotLegacy` (adapter-table diff function) is
  untouched — its `MAX(severity)` / `AVG(severity)` read the `public.hazards` /
  `public.infrastructure_issues` adapter tables, preserved verbatim for diffing.

### Permission — `backend/migrations/20260617_canon_norm_3_grant_normalized_view_select.sql` (new, + rollback)
- `GRANT SELECT ON core.v_observation_normalized TO fieldpro, intelligence_reader`. Step 4
  created the seam with no grants ("the view holds no data and copies no grants") because
  nothing read it yet; this is its first reader. `fieldpro` is the role the app connects
  as today (runs the risk job); `intelligence_reader` is the labor-safety read role this
  work targets once ISSUE-018 wires the app connection. The seam exposes only normalized
  axes + join keys — **no worker-identity column** — so the grant does not widen the
  identity surface, and the actor-audit sidecars stay no-grant for `intelligence_reader`.

### CC high-severity tile — remains hidden (NOT re-enabled)
- The dispatch asked to restore the Control Center high-severity tile, but re-enabling a
  "high-severity count" requires a `severity >= N` cut — i.e. choosing which `norm_severity`
  value counts as "high." That threshold is an **encoding/definition decision owned by
  INTEL-SEVERITY-WEIGHTING**, which has **not ratified one** (parked/unstarted).
  Hardcoding `>= N` in the reader would violate the read-the-column discipline this card
  exists to enforce. Per the card's stop condition ("Picking a NUMBER = intelligence"),
  the constraint wins and the tile stays blocked. Its blocker has **changed**: previously
  hidden because severity was synthesized (fake 1.0); now hidden pending the unratified
  high-severity threshold. When that threshold is ratified, riskMapService reads it — it
  is not hardcoded here. Tile restoration is a tracked deliverable of the intelligence
  session.

### Test — `backend/tests/canonical/riskMapSeverity.test.ts` (new, wired into `run.ts`)
- Seeds an in-window hazard via the real write chain (`emitObservationsForStop` →
  `norm_severity = 3`), runs `rebuildStopRiskSnapshot`, then drops the magnitude to NULL
  and rebuilds. Asserts: `last_hazard_severity` reads the real `3` (not a flat `1.0`); a
  NULL-magnitude hazard still counts (`safety_score > 0`, floor `1`); and `safety_score`
  scales linearly with the real magnitude (the magnitude-3 score is exactly 3× the
  presence-floor score — an encoding-independent ratio that isolates the magnitude).

## Why
- P1 / CANON-NORM-3 converts the canonical-lossless `norm_severity` (opened by
  CANON-NORM-1, populated by CANON-NORM-2) into a real intelligence read, replacing the
  synthesized flat `1.0`. This is a strict improvement: a real worker-asserted ordinal
  magnitude replaces a flat fake. Scope held to "swap synthesize → read"; no severity
  scale, weight, cap, or threshold was authored (the one boundary the repoint forced —
  the CC tile threshold — was reported, not decided).

## Verification (live, dev DB)
- **Grep:** `riskMapService.ts` canonical `haz` CTE no longer contains the `1.0`
  synthesized severity or any category→number map; reads `norm_severity` from
  `core.v_observation_normalized` (`COALESCE(o.norm_severity, 1)` at the seam). No
  low/medium/high logic in the reader.
- **Before/after (the 2 known high=3 rows — both biohazard/encampment on stop 80580):**
  `last_hazard_severity` 1.0 (synth) → **3** (real). Magnitude isolated at in-window
  recency: `safety_score` 3.00 → **9.00** (real magnitude = 3× the flat fake). Their live
  decayed score is 0.00 → 0.00 only because the rows are 16 days old (outside the 7-day
  effect window — correct, unchanged); the in-window path is proven live by the test.
- **NULL handling proven:** the test's NULL phase shows a present hazard with NULL
  `norm_severity` → `last_hazard_severity` = 1, `safety_score` > 0 (counts, not dropped).
- **CC tile:** left hidden by design (threshold is an unratified intelligence decision).
- `tsc --noEmit`: **clean.**
- Canonical suite: **118 passed, 0 failed** (117 prior + 1 new).
- Labor safety: **0** worker-identity columns introduced (seam + grant expose only
  normalized axes; no actor/OID columns added anywhere).

## Files touched
- `backend/src/intelligence/riskMapService.ts` (hazard severity repoint; infra preserved+flagged)
- `backend/migrations/20260617_canon_norm_3_grant_normalized_view_select.sql` (new)
- `backend/migrations/rollback/20260617_canon_norm_3_grant_normalized_view_select_rollback.sql` (new)
- `backend/tests/canonical/riskMapSeverity.test.ts` (new)
- `backend/tests/run.ts` (registered new test file)
