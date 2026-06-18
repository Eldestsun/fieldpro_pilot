# PR Draft — CANON-NORM-3: repoint riskMapService hazard severity to real norm_severity

**Branch:** `feat/canon-norm-3-riskmap-severity-repoint` → `main`
**Stacked on:** `feat/canon-norm-2-hazard-infra-severity-carry` (CANON-NORM-1 + CANON-NORM-2 commits; merge those first, or rebase this onto `main` after they land)
**Title:** `feat(canon-norm): repoint riskMapService hazard severity to real norm_severity (CANON-NORM-3)`

---

**SIGNIFICANCE**

Converts the canonical-lossless `norm_severity` (opened by CANON-NORM-1, populated by
CANON-NORM-2) into a real intelligence read. `rebuildStopRiskSnapshot` is now the **first
real reader** of the §4.3 seam `core.v_observation_normalized`. Hazard severity stops being
a synthesized flat `1.0` and becomes the real worker-asserted magnitude — a strict
improvement (real ordinal replaces a flat fake). The reader stays dumb: it treats
`norm_severity` as an opaque `0..N` magnitude and encodes nothing, so when
INTEL-SEVERITY-WEIGHTING later changes the encoding, the score inherits it automatically.

**WHAT LANDED**

- **Hazard repoint** (`riskMapService.ts`, `rebuildStopRiskSnapshot`): the `haz` CTE now
  reads `FROM core.v_observation_normalized` and resolves the 8 pinned safety presence
  types via `JOIN core.observation_type_registry ON id = type_id` (the seam exposes
  `type_id`, not `observation_type`). `DISTINCT ON (stop) … ORDER BY observed_at DESC`
  keeps `last_hazard_at`/`hazard_days_ago` = most-recent hazard and pairs that row's
  magnitude. `safety_score` multiplies the **pre-existing** `HAZARD_BASE_WEIGHT` by the
  magnitude — no weight, scale, cap, or threshold was authored.
- **NULL handling** (`COALESCE(o.norm_severity, 1)` inside the CTE, where every row is a
  present hazard): a present-but-unmagnituded hazard floors to the **multiplicative
  identity 1** — "still counts, no magnitude multiplier." Not a severity-scale literal;
  encoding-independent. The "no hazard" case stays the downstream LEFT-JOIN miss (→ 0). A
  NULL-magnitude hazard is never zeroed or dropped.
- **Infra NOT repointed** (preserved + flagged): infra has no canonical severity source
  (every infra presence row `norm_severity` NULL), so the `COUNT(*)`-capped-at-5 proxy is
  kept byte-for-byte. Repointing it would collapse the infra signal to zero — a
  scoring/weighting decision deferred to **INTEL-SEVERITY-WEIGHTING** per the card's stop
  condition.
- **Grant** (`20260617_canon_norm_3_grant_normalized_view_select.sql`, + rollback):
  `GRANT SELECT ON core.v_observation_normalized TO fieldpro, intelligence_reader`. Step 4
  created the seam with no grants (no reader yet); this is the first reader. The seam
  exposes only normalized axes + join keys — **no identity column** — so the grant does not
  widen the identity surface and the actor-audit sidecars stay no-grant for
  `intelligence_reader`.
- **Test** (`riskMapSeverity.test.ts`): seeds an in-window hazard (`norm_severity=3`) via
  the real write chain, rebuilds, drops it to NULL, rebuilds. Asserts real magnitude read
  (3, not flat 1.0), NULL still counts (score > 0, floor 1), and the score scales linearly
  (magnitude-3 score = exactly 3× the presence floor — an encoding-independent ratio).

**CC HIGH-SEVERITY TILE — REMAINS HIDDEN (intentional)**

> CC high-severity tile remains hidden. Its blocker has CHANGED: previously hidden because
> severity was synthesized (fake 1.0); now hidden pending the high-severity threshold
> (`>= N`), an unratified intelligence decision parked in INTEL-SEVERITY-WEIGHTING. When
> that threshold is ratified, riskMapService reads it — it is not hardcoded here. Tile
> restoration is a tracked deliverable of the intelligence session.

The dispatch's "re-enable the tile" instruction contradicted its own "never hardcode a
threshold" / "no `1/2/3` literal, no scale assumption" constraint. The constraint wins:
picking which `norm_severity` counts as "high" is a NUMBER = intelligence, not state. Tile
left blocked, reported, not decided.

**VERIFICATION (live, dev DB)**

- **Grep:** canonical `haz` CTE no longer contains the synthesized `1.0` or any
  category→number map; reads `norm_severity` from `core.v_observation_normalized`
  (`COALESCE(o.norm_severity, 1)`). No low/medium/high logic in the reader. (Legacy diff
  function's `MAX/AVG(severity)` over adapter tables is untouched.)
- **Before/after (the 2 known high=3 rows — biohazard + encampment, both on stop 80580):**
  `last_hazard_severity` 1.0 → **3**. Magnitude isolated at in-window recency: `safety_score`
  3.00 → **9.00** (3× the flat fake). Their *live* decayed score is 0.00 → 0.00 only because
  the rows are 16 days old (outside the 7-day effect window — unchanged, correct); the
  in-window path is proven live by the test.
- **NULL handling:** test's NULL phase → present hazard, `last_hazard_severity` = 1,
  `safety_score` > 0 (counts, not dropped).
- `tsc --noEmit` clean. Canonical suite **118 passed / 0 failed** (117 + 1 new). **0**
  worker-identity columns introduced.

**DEPLOY NOTE**

Run `20260617_canon_norm_3_grant_normalized_view_select.sql` (as DB owner) before/with this
deploy — without the grant, `fieldpro` (the app role that runs the risk job today) gets
`permission denied for view v_observation_normalized`.

**SCOPE / BOUNDARY**

Only "synthesize severity → read real norm_severity magnitude." Did not author category
weights, redefine "problem stop", recalibrate the infra cap, or pick the CC tile threshold.
The single boundary the repoint forced (the tile threshold) was reported, not decided.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
