# 2026-06-14 — Clean-Log Action Data: Does a Canonical Home Already Exist?

**Type:** Read-only verification (analysis-only — no code/schema/migration changes).
**Question:** Before dispatching the Layer 3 "pivot clean_logs booleans from canonical
observation rows" rewrite — does a canonical-side home for the clean-log ACTION data
already exist, and does an existing pivot already produce the per-visit boolean set?
**Method:** Live SQL against `fieldpro_db` (postgres superuser, bypasses RLS) + grep over
`backend/src`. All evidence pasted below.

---

## The 5 action booleans — CONFIRMED (exactly 5)

`\d clean_logs` (live):

```
 picked_up_litter  | boolean | default false
 emptied_trash     | boolean | default false
 washed_shelter    | boolean | default false
 washed_pad        | boolean | default false
 washed_can        | boolean | default false
```

Exactly the 5 named in the request. `clean_logs` is the **transit adapter** table
(`public.clean_logs`); it still carries `user_id` (adapter-layer, not intelligence-layer).

---

## Candidate 1 — `core.observations` as action rows → **EXISTS & POPULATED & READABLE**

### 1:1 registry mapping exists (5 of 5)

`core.observation_type_registry` carries an `obs_kind='action'` row for each boolean:

```
 id | observation_key  | display_name      | value_type | is_active | obs_kind
----+------------------+-------------------+------------+-----------+---------
  5 | washed_can       | Washed Can        | boolean    | t         | action
 55 | picked_up_litter | Picked Up Litter  | boolean    | t         | action
 56 | emptied_trash    | Emptied Trash     | boolean    | t         | action
 57 | washed_shelter   | Washed Shelter    | boolean    | t         | action
 58 | washed_pad       | Washed Pad        | boolean    | t         | action
```

The registry enforces the four-kind taxonomy (`condition|action|measurement|presence`).
All 5 booleans map 1:1 to an active action type.

### Written on the live path? YES — but present-only (sparse) encoding

```
SELECT observation_type, obs_kind, count(*) FROM core.observations
WHERE observation_type IN ('washed_can','picked_up_litter','emptied_trash','washed_shelter','washed_pad')
GROUP BY 1,2;

 observation_type | obs_kind | count
------------------+----------+-------
 emptied_trash    | action   |     4
 picked_up_litter | action   |     4
```

Only 2 of 5 keys have rows. **This is NOT a write-path gap — it is the encoding plus the
demo data.** Cross-check against the source `clean_logs`:

```
 id | visit_id | picked_up_litter | emptied_trash | washed_shelter | washed_pad | washed_can
----+----------+------------------+---------------+----------------+------------+-----------
  1 |       89 | t                | t             | f              | f          | f
  2 |       90 | t                | t             | f              | f          | f
  3 |       91 | f                | f             | f              | f          | f
  4 |       93 | t                | t             | f              | f          | f
  5 |       94 | f                | f             | f              | f          | f
  6 |       95 | t                | t             | f              | f          | f
```

`washed_shelter / washed_pad / washed_can` are **false in all 6 rows**, so they correctly
produce **zero** observation rows. The action observations exactly mirror the TRUE booleans:

```
 visit_id | observation_type | obs_kind | intervention     | payload
----------+------------------+----------+------------------+--------
       89 | picked_up_litter | action   | picked_up_litter | {}
       89 | emptied_trash    | action   | emptied_trash    | {}
       90 | picked_up_litter | action   | picked_up_litter | {}
       90 | emptied_trash    | action   | emptied_trash    | {}
       93 | ...              | ...      | ...              | {}
       95 | ...              | ...      | ...              | {}
```

Visits 91 and 94 (all-false clean_logs) have **no** action rows. **One row per performed
cleaning; absence = false.**

### Write path covers all 5 (not just the 2 exercised)

`backend/src/domains/observation/observationService.ts:161-178` — one `if (ui.<key>)` →
`obs.push({observation_type:'<key>'})` branch for **each of the 5 keys**:

```
if (ui.picked_up_litter) obs.push({ observation_type: "picked_up_litter", payload: {} });
if (ui.emptied_trash)    obs.push({ observation_type: "emptied_trash",    payload: {} });
if (ui.washed_shelter)   obs.push({ observation_type: "washed_shelter",   payload: {} });
if (ui.washed_pad)       obs.push({ observation_type: "washed_pad",       payload: {} });
if (ui.washed_can)       obs.push({ observation_type: "washed_can",       payload: {} });
```

So the canonical home is **structurally complete for all 5** — the 3 empties are demo-data
artifacts, not coverage gaps. Rows are keyed by `visit_id` and readable by the no-grant
intelligence role (the action key lives in the **structured `intervention` column**, not in
`payload` — see Candidate 3).

**Verdict: EXISTS & POPULATED & READABLE.** This is the canonical home for the action data.

---

## Candidate 2 — `stop_effort_history` → **EXISTS & POPULATED, but does NOT carry the action set**

`\d stop_effort_history` (live), 6 rows:

```
 service_minutes  | integer
 stop_type        | text       (hotspot|compactor|standard)
 complexity_score | numeric(4,2)
 had_hazard       | boolean
 had_infra_issue  | boolean
 trash_volume     | numeric(4,2)
```

Keyed by `(stop_id, visit_id)`, no `user_id` (labor-safe rollup, as designed). It carries
**effort/complexity**, not per-action booleans. There is no `washed_*` / `picked_up_litter`
/ `emptied_trash` column and nothing equivalent. The endpoints **cannot** read the action
set from here.

**Verdict: EXISTS & POPULATED, but NOT a home for the clean-action data.** Ruled out.

---

## Candidate 3 — normalized / structured column → **LANDED for actions (the `intervention` column)**

`core.observations` carries the normalized columns at the DB level:

```
 obs_kind      | text      (condition|action|measurement|presence)
 norm_status   | text      (ok|not_ok|unknown)
 norm_severity | smallint
 intervention  | text
 type_id       | bigint    -> observation_type_registry
```

Per `observationNormalizer.ts:165-175`, **action rows carry the act identifier in the
structured `intervention` column** (`intervention = obs_kind==='action' ? observationType : null`).
Confirmed live: every action row has `intervention = '<key>'` and `payload = {}`. So the
action identity is in a **structured, queryable column — not buried in `payload`.** This
makes any pivot a trivial `EXISTS(intervention = '<key>')`, not a JSON dig.

(Note: `norm_status`/`norm_severity` are null on action rows by design — actions have no
ok/not-ok state; the data they carry IS the `intervention`.)

**Verdict: the structured encoding for actions EXISTS and is populated.** Aligns with the
in-flight CANON-NORM normalized-shape work (`docs/audit/2026-06-14-normalized-shape-build-status.md`).

---

## Rule-out — identity sidecars do NOT carry this

`\d core.observation_actor_audit`:

```
 observation_id       | bigint   not null
 org_id               | bigint   not null
 actor_ref            | text     not null
 actor_ref_ciphertext | bytea
 actor_ref_key_id     | text
 recorded_at          | timestamptz
```

Identity only (worker `actor_ref` / OID, plaintext + ciphertext). **No action booleans.**
Confirmed: the `*_actor_audit` sidecars are not a home for action/condition data.

---

## The key question — does an existing pivot ALREADY produce the per-visit boolean set?

**NO existing pivot reconstructs the 5-boolean set from canonical observations.**

Two views touch this area; neither is a canonical action pivot:

1. **`core.v_clean_logs_transit`** — surfaces all 5 booleans, **but reads them straight from
   `clean_logs` columns** (`cl.picked_up_litter … cl.washed_can`), adding `location_id`
   resolution. It reads the *legacy source*, not canonical observations. This is the table
   Layer 3 wants to pivot *away* from.

2. **`core.v_observation_normalized`** — projects `(id, org_id, visit_id, asset_id, type_id,
   observed_at, obs_kind, norm_status, norm_severity, intervention)` row-per-observation
   (deliberately excludes `payload`). It exposes `intervention` but does **not** pivot/group
   into per-visit booleans.

No matview pivots it either (`stop_status_mv` does not). And no code reads it back: grep for
`intervention` across `backend/src` returns **only** the write/normalize side
(`observationService.ts`, `observationNormalizer.ts`) — **zero read-side consumers.**

Every live read of the 5 action booleans in the app reads them **from `clean_logs`**, not
from canonical:
- `domains/routeRun/loaders/loadRouteRunById.ts:65,81` → `LEFT JOIN clean_logs cl` (its
  `core.observations` join at line 97 is filtered to `observation_type='spot_check'` for
  photo evidence — **not** an action pivot).
- `modules/ops/opsRoutes.ts:404,409` and `modules/admin/adminRoutes.ts:704,709` →
  `FROM clean_logs cl`.

---

## Bottom line — BUILD a (thin) pivot; the DATA HOME is already there

- **The canonical data home EXISTS, is POPULATED, and is READABLE** (Candidate 1:
  `core.observations` action rows, present-only, keyed by `visit_id`, with the act key in the
  structured `intervention` column). The Layer 3 rewrite does **not** need to build a new data
  home or a new write path — that work has landed and covers all 5 keys.

- **What does NOT exist is the read-side pivot.** No view, matview, or code reconstructs the
  per-visit 5-boolean set from canonical observations. `v_clean_logs_transit` produces the
  booleans only by reading the legacy `clean_logs` columns.

- **Therefore Layer 3 must BUILD a pivot — but a thin one.** It is an aggregation over an
  existing, populated, structured column, not a from-scratch data build:

  ```sql
  -- per visit, per action key: present-only row ⇒ true, absence ⇒ false
  SELECT v.id AS visit_id,
         bool_or(o.intervention = 'picked_up_litter') AS picked_up_litter,
         bool_or(o.intervention = 'emptied_trash')    AS emptied_trash,
         bool_or(o.intervention = 'washed_shelter')   AS washed_shelter,
         bool_or(o.intervention = 'washed_pad')       AS washed_pad,
         bool_or(o.intervention = 'washed_can')       AS washed_can
  FROM core.visits v
  LEFT JOIN core.observations o
         ON o.visit_id = v.id AND o.obs_kind = 'action'
  GROUP BY v.id;
  -- COALESCE(..., false) the bool_or to turn NULL (no action rows) into false.
  ```

  Layer 3 should **point the action-boolean reads at this pivot** (replacing the
  `FROM clean_logs` reads in `opsRoutes`, `adminRoutes`, `loadRouteRunById`) rather than
  designing a new canonical structure.

- **Where the founder's "sidecar" memory most likely maps:** **Candidate 1**, not the
  identity `*_actor_audit` sidecars. The action data was extracted into canonical action
  *observation rows* (carried beside the main observation in the structured `intervention`
  column) at the same time the identity columns were extracted into the no-grant
  `*_actor_audit` sidecars (the 2026-06-13 cleanlogs-identity-drop work). The two extractions
  happened together, which is the likely source of the "a solution may already have been
  built / it's in a sidecar" recollection. The action data is canonical and populated; only
  the boolean pivot remains to be built.

---

## Drift note (live DB vs prior audits)

No drift found against the request's premises. The normalized columns
(`obs_kind / norm_status / norm_severity / intervention`) **exist and are populated** on
`core.observations` at the DB level — consistent with the in-flight CANON-NORM work
(`docs/audit/2026-06-14-normalized-shape-build-status.md`, migration
`20260614_canon_norm_step2_registry_contract.sql`). The CLAUDE.md note that §4 "normalized
columns" items 4–5 "remain deferred" refers to the *target-state migration*, not to these
columns being absent; the action-relevant structured column (`intervention`) is present and
carries the act key today. Live DB is authoritative; recorded here per the constraint.
