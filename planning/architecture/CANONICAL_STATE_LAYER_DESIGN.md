# BASELINE — Canonical State Layer Design

> **STATUS: TARGET DESIGN — PENDING §9 VERIFICATION.** This document is direction,
> not ratified law. Its DDL must be reconciled against the live schema before any
> migration is written. Conform new design to this doc; do not treat its DDL as
> deployable until §9 closes.

> A portable state layer for any field-condition work that shares these invariants:
> someone **visits** a **thing**, records **what they found or did**, optionally with **proof** —
> and the record must attach to the thing, never to the worker.
>
> Transit is *adapter #1*, not the product. The product is this core.

---

## 1. The thesis in one paragraph

The canonical layer owns a fixed **grammar** of four nouns — asset, visit,
observation, evidence — and a **registry** that gives those nouns industry-specific
**meaning as data**. Observations live on **two independent axes**: what *condition*
was found, and what *action* was taken. Conflating them destroys the product's core
signal (a chronically-dirty-but-maintained asset is indistinguishable from a clean
one once you collapse "what's wrong" and "what I did" into one status). The four
kinds — **condition**, **action**, **measurement**, **presence** — keep those axes
separate by construction. An adapter is nothing more than: (a) rows in the registry
that declare its vocabulary, (b) its own capture UI, and (c) a one-way translation
from its local identifiers to canonical asset IDs. To add an industry you write an
adapter. You never touch the core. The intelligence layer reads only *normalized*
observation columns and derives change-over-time from the **rate and trend of
asserted observations against visit-completeness anchors** — never from a stored
arrival/departure pair.

**Portability test applied to every column below:** would this mean the same thing
for a transit stop, a public-housing unit, and a utility pole? If yes → core.
If it only means something for one industry → registry vocabulary or adapter table,
never the core.

---

## 2. The non-negotiable invariants

1. **Observation attaches to the asset, not the worker.** Worker identity is not a
   column on any table the intelligence layer can read. Anonymity is a fact about
   *where columns live*, not a rule enforced in queries.
2. **Meaning lives in data (the registry), not in code.** Adding an observation type
   is an INSERT, not a deploy. No query branches on a hardcoded type name.
3. **Condition and action are independent axes.** Recording an intervention
   ("emptied the trash") never implies a condition assertion ("was full"), and vice
   versa. They are separate observation kinds and are never collapsed into one
   ok/not_ok status.
4. **Absence is a counted signal, not a missing data point.** An unchecked
   component within a completed visit is the *absence* of an observation, and that
   absence — measured against the registry's declared possible types for the asset
   type, anchored by a `core.visits` row that proves presence — is itself
   countable. It is never force-filled with a default ok/not_ok. See §4.4 for the
   mechanism. (One exception by construction: the **spot check**, a stop-level
   positive condition assertion described in §3.5, anchors a visit and makes
   component-level silence safe to read as benign.)
5. **No default or inferred arrival state.** No observation is auto-created on
   visit start. An observation exists only when the worker asserts something.
   *Rationale:* a default arrival state would be an un-asserted guess — the exact
   work-order-inference weakness this product rejects. The schema must never
   manufacture a value the field did not produce.
6. **Store the facts, derive the transition.** Arrival→departure change is never
   stored as a row or as a paired before/after record. It is derived by
   intelligence from the rate and trend of condition + action observations
   composed within and across visits. The DB holds asserted facts; the analytical
   layer composes them into change.
7. **The capture UI is the contract for what observations can exist.** The schema
   must never require a value the live capture surface does not collect. Today
   that surface produces: actions (litter pickup, trash emptying, shelter wash,
   pad wash, can wash), problem-flags (safety / infrastructure presence flags),
   one stop-level positive anchor check (spot check), one measurement (trash
   volume 0–4), and evidence (photo). No arrival condition is captured; therefore
   none is stored.
8. **The raw payload is never lost, and never read by intelligence.** It is kept
   for fidelity and audit; normalized columns are what queries consume.
9. **Org scoping is structural.** Every canonical table carries `org_id` and is
   row-level-security enforced. Multi-tenant from row one.

### 2.1 Anti-pattern: never manufacture a fact that is already entailed

Several invariants above (#3, #5, #6) are special cases of one general defect:
**writing a row whose meaning is fully determined by other rows already in the
schema.** Such rows add no signal, duplicate effort, and invite double-counting
in any consumer that does not know which row is canonical.

Two instances retired by this design (one already removed; the other retired in
the 2026-05-25 dual-retirement):

| Manufactured fact | Already entailed by | Why it's a defect |
|---|---|---|
| ~~Default arrival condition (auto-`dirty` on visit start)~~ | The worker's actual condition assertion if any (none otherwise = silence-as-signal, §4.4) | A worker-independent guess masquerading as an asserted state. The exact work-order-inference weakness the product rejects. |
| ~~Paired before/after row ("dirty arrival → clean departure")~~ | A condition assertion (if graded) + an action observation (if performed), composed by intelligence as a derived transition (invariant #6) | Stores a derivation as a fact. The transition is computable; storing it doubles the schema and risks divergence. |
| ~~`safety_concern_present` (generic umbrella)~~ | The specific hazard presence(s) the worker selected in the Report Safety modal (one or more of: encampment, fire, dangerous_activity, drug_use, violence, biohazard, access_blocked, other_safety_concern) | The umbrella is lower-resolution than the specific. Writing both invites double-counting; writing only the umbrella loses the specific danger; writing only the specific carries the same information at higher resolution. |
| ~~`stop_not_serviced_due_to_safety` (generic non-service flag)~~ | `core.visits.outcome = 'skipped'` with `reason_code = 'safety'` | A duplicate fact in a second table. Two sources of truth for "did this stop get serviced," with no rule that says which wins. |

The principle generalizes: when adding a registry type or write path, ask
whether the row would be entailed by other rows that are already written. If
yes, do not add it; let the consumer compose the derivation.

**Corollary — specific is the enrichment; the generic umbrella is duplication.**
Danger (or infrastructure issue, or any flagged condition) is captured as the
SPECIFIC presence observation regardless of whether the visit was skipped:
serviced-anyway hazards still count. A generic umbrella that exists only to
mean "at least one of the specifics is present" carries no information the
specifics don't already carry.

> **Open candidate under the same principle:** `infrastructure_issue_present`
> is the surviving generic umbrella; it is entailed by the OR over the 8
> specific infrastructure `*_present` types. Not retired in the 2026-05-25
> sprint to keep that change scoped; flagged here so the next ratification
> pass can apply the same rule.

---

## 3. The four nouns

### 3.1 Asset — a thing with persistent identity and history

```sql
CREATE TABLE core.assets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          bigint NOT NULL REFERENCES core.organizations(id),
    asset_type_id   bigint NOT NULL REFERENCES core.asset_types(id),
    -- stable handle the adapter translates its local id into; unique per org
    external_key    text NOT NULL,
    -- most field-condition work is geospatial; optional because not all is
    latitude        double precision,
    longitude       double precision,
    -- human label only; NOT a place for industry fields
    display_name    text,
    status          text NOT NULL DEFAULT 'active',   -- active | retired
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, external_key)
);
```

What is deliberately **absent**: route, shelter model, building number, pole class.
All of that is adapter vocabulary. It lives in adapter-side tables that reference
`core.assets(id)` — e.g. `transit.stop_attributes(asset_id, route_id, shelter_type)`.
The core asset stays industry-neutral forever.

### 3.2 Visit — an occasion when someone looked

```sql
CREATE TABLE core.visits (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          bigint NOT NULL REFERENCES core.organizations(id),
    asset_id        uuid   NOT NULL REFERENCES core.assets(id),
    started_at      timestamptz NOT NULL,
    ended_at        timestamptz,
    outcome         text NOT NULL DEFAULT 'in_progress',
        -- in_progress | completed | skipped | unable_to_access
    reason_code     text,            -- required when outcome <> completed
    -- optional link to the plan that scheduled this visit (enables
    -- "planned but never visited" detection without an adapter join)
    assignment_id   uuid REFERENCES core.assignments(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Where identity is NOT.** There is no `worker_id` / `actor_oid` column here. If an
adapter must record who performed a visit for audit or evidentiary reasons, it goes
in a separate, access-controlled table that the intelligence layer has no grant on:

```sql
-- audit-only; NOT readable by the intelligence role
CREATE TABLE core.visit_actor_audit (
    visit_id    uuid PRIMARY KEY REFERENCES core.visits(id),
    org_id      bigint NOT NULL REFERENCES core.organizations(id),
    actor_ref   text NOT NULL,        -- opaque external identity (e.g. Entra OID)
    recorded_at timestamptz NOT NULL DEFAULT now()
);
-- GRANT SELECT ON core.visit_actor_audit TO audit_role;   -- and ONLY audit_role
```

The intelligence layer is given a DB role with **no grant** on `visit_actor_audit`.
A signal that tried to attribute a metric to a worker would fail at the permission
layer, not at code review. That is the guarantee made structural.

### 3.3 Observation — the center of the system

```sql
CREATE TABLE core.observations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          bigint NOT NULL REFERENCES core.organizations(id),
    visit_id        uuid   NOT NULL REFERENCES core.visits(id),
    -- denormalized on purpose: asset timeline is a single-table scan.
    -- asset is immutable for the life of the observation -> no update anomaly.
    asset_id        uuid   NOT NULL REFERENCES core.assets(id),
    type_id         bigint NOT NULL REFERENCES core.observation_type_registry(id),

    observed_at     timestamptz NOT NULL,

    -- ===== normalized columns: the universal questions, derived from the
    -- registry rule at write time. Intelligence reads ONLY these. =====
    obs_kind        text NOT NULL,        -- condition | action | measurement | presence
    -- norm_status is KIND-CONDITIONAL:
    --   condition    -> ok | not_ok | unknown   (gradable state)
    --   measurement  -> ok | not_ok | unknown   (gradable against threshold)
    --   presence     -> NULL                    (existence of the row IS the signal;
    --                                            problem-flag rows are implicitly not_ok,
    --                                            so a separate status would be redundant)
    --   action       -> NULL                    (an intervention has no ok/not_ok)
    norm_status     text,                 -- nullable on purpose; see kind table above
    norm_severity   smallint,             -- 0..N common scale; NULL if n/a
    -- action observations carry an intervention value (e.g. 'picked_up_litter',
    -- 'washed_pad'); NULL on every other kind. Read by operational/MV consumers
    -- as the act that happened.
    intervention    text,

    -- raw, type-specific detail. Kept for fidelity + audit. NEVER read by
    -- intelligence queries. Validated against the registry's JSON Schema on write.
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON core.observations (asset_id, observed_at);
CREATE INDEX ON core.observations (org_id, type_id, observed_at);
CREATE INDEX ON core.observations (visit_id);
```

The normalized columns are the entire fix for the "five spellings of clean"
problem on the *condition* axis. `payload->>'state' = 'clean'`, `state = 'empty'`,
`level <= 1` all collapse into `norm_status = 'ok'` on a condition or measurement
row. Action rows live on their own axis — their `intervention` column says
*which* act, not whether the asset was OK. Conflating those axes was the original
defect this redesign closes.

### 3.4 Evidence — proof

```sql
CREATE TABLE core.evidence (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          bigint NOT NULL REFERENCES core.organizations(id),
    visit_id        uuid   NOT NULL REFERENCES core.visits(id),
    -- the fix the audit flagged: link evidence to the specific observation,
    -- not just the visit. Nullable for visit-level evidence with no single obs.
    observation_id  uuid REFERENCES core.observations(id),
    kind            text NOT NULL DEFAULT 'capture',   -- capture | verification | ...
    storage_key     text NOT NULL,
    captured_at     timestamptz NOT NULL DEFAULT now()
    -- captured_by stays in an audit-only sidecar if needed, mirroring visits.
);
CREATE INDEX ON core.evidence (observation_id);
CREATE INDEX ON core.evidence (visit_id);
```

### 3.5 The spot check — a stop-level positive condition anchor

A **spot check** is a stop-level **condition** observation with `norm_status = 'ok'`
that the field worker asserts when the asset, considered as a whole, required no
servicing. It is **not** an absence; it is a *positive* assertion. Its purpose is
to anchor the visit so that component-level silence (no `washed_pad`, no
`graffiti_present`, etc.) is safe to read as benign rather than ambiguous.

A spot check is a **completed servicing visit** with outcome "assessed, no work
needed." It is **not** a non-service event and **not** an intervention; it is
explicitly distinct from cleaning actions (`washed_can`, `picked_up_litter`,
etc.). The only non-service visit outcome remains `skipped` with
`reason_code = 'safety'`.

```text
kind        = condition
norm_status = ok
payload     = { "scope": "stop", "result": "no_work_needed" }
```

In §4.2 normalization terms: a spot check is `kind=condition`, not the legacy
`presence_is='good'` formulation. (The earlier doc framed it as a presence row;
the new model makes it a first-class condition assertion at stop scope, since
that is what it actually is — a worker stating "this asset is OK as a whole.")

**This gates the intelligence layer.** Until the `spot_check` registry row is
seeded AND the spot-check capture flow writes it on every visit where the
worker asserts "no work needed," the intelligence layer cannot safely interpret
component-level silence as benign — component silence without a stop-level
anchor is "nothing was asserted," not "nothing was wrong." Status as of
2026-05-25: the registry row is seeded (via the Tier 8 seeder), and the write
path `emitSpotCheckObservation` already exists in `observationService.ts`. With
both in place, §4.4 absence-as-counted-signal is unblocked for transit. A
follow-up pass should ensure the payload shape written today (`{}`) is
reconciled with the refined target shape (`{"scope": "stop", "result":
"no_work_needed"}`) before payload validation lands (§9 Q4).

---

## 4. The registry — meaning as data

### 4.1 The type contract

```sql
CREATE TABLE core.observation_type_registry (
    id              bigserial PRIMARY KEY,
    org_id          bigint NOT NULL REFERENCES core.organizations(id),
    asset_type_id   bigint NOT NULL REFERENCES core.asset_types(id),
    type_key        text   NOT NULL,        -- 'shelter_condition', 'mold_present', 'washed_pad'
    obs_kind        text   NOT NULL,        -- condition | action | measurement | presence

    -- writes are validated against this; malformed payloads are rejected
    payload_schema  jsonb  NOT NULL,        -- JSON Schema

    -- the OK-rule, interpreted per kind (§4.2). Required for condition + measurement;
    -- presence rows use it to declare the implicit "row exists → problem flagged"
    -- semantics; action rows have NULL ok_rule (they carry intervention values, not
    -- statuses, and are never OK-judged).
    --   condition:   {"ok_values": ["clean","empty","habitable"], "path": "state"}
    --   measurement: {"path": "level", "ok_max": 1}        (or ok_min)
    --   presence:    {"presence_is": "bad"}                 (problem-flag; row exists = not_ok)
    --   action:      NULL                                   (intervention recorded, no status)
    ok_rule         jsonb,

    -- raw reading -> 0..N common severity scale
    severity_map    jsonb,

    sort_order      int    NOT NULL DEFAULT 100,
    active          boolean NOT NULL DEFAULT true,
    UNIQUE (org_id, asset_type_id, type_key)
);
```

### 4.2 The one generic normalizer (pseudocode — the only place meaning is computed)

```
function normalize(type_row, payload):
    intervention = NULL
    status       = NULL          # default for kinds that don't grade

    switch type_row.obs_kind:

      case 'condition':
        v = payload[type_row.ok_rule.path]
        status = v in type_row.ok_rule.ok_values ? 'ok'
               : v is null                        ? 'unknown'
               :                                    'not_ok'

      case 'measurement':
        n = payload[type_row.ok_rule.path]
        ok = (ok_max present and n <= ok_max) or (ok_min present and n >= ok_min)
        status = n is null ? 'unknown' : ok ? 'ok' : 'not_ok'

      case 'presence':
        # A presence row is a problem-flag. Its EXISTENCE is the signal
        # ("graffiti present", "biohazard present"). Status is left NULL on
        # purpose: intelligence counts existence, not an ok/not_ok bit.
        status = NULL

      case 'action':
        # An intervention was performed. No ok/not_ok value is meaningful here.
        # The intervention value identifies which act; status stays NULL.
        intervention = payload[type_row.ok_rule.path]   # or a fixed value per type
        status       = NULL

    severity = apply(type_row.severity_map, payload)   # NULL if no map
    return (kind=type_row.obs_kind, status, severity, intervention)
```

This function never changes when a new industry arrives. New behavior = new
registry rows. The two-axis design (condition/measurement grade on one side;
action/presence assert facts on the other) is the portability guarantee.

### 4.3 The normalized read surface

```sql
-- the ONLY thing intelligence and dashboards read for asserted facts.
-- Because normalization happens at write, this view is a passthrough today,
-- but it is the seam: if normalization logic ever needs to change, it changes
-- here, once, for every industry and every signal.
CREATE VIEW core.v_observation_normalized AS
SELECT id, org_id, visit_id, asset_id, type_id,
       observed_at, obs_kind, norm_status, norm_severity, intervention
FROM core.observations;
```

Every signal in every layer — operational, executive, stewardship — reads
`obs_kind` + `norm_status` (for condition/measurement gradable rows),
existence-of-row (for presence problem-flags), or `intervention` (for action
rows). None of them ever touch `payload`. Add a sixth transit type, or a whole
housing adapter, and the signals are unaffected.

### 4.4 Absence as a counted signal

Absence is canonical and **produces no row**. An unchecked component within a
completed visit is the absence of an observation, and that absence is itself a
recorded signal. It is never force-filled with a default ok/not_ok.

Absence becomes legible — and therefore countable — only when **both** of the
following hold:

1. **A visit anchor exists in `core.visits` that proves presence.** The worker
   was at the asset (or the stop was assessed as a whole, via a §3.5 spot
   check). Without an anchor, absence is indistinguishable from "never visited"
   and carries no signal.
2. **The registry declares the full set of possible observation types for the
   asset type.** The denominator (what *could* have been recorded) is the
   registry's list of active types for that asset_type. The numerator is what
   *was* recorded on this visit.

Given (1) + (2), an empty cell within a completed visit is a **recorded
non-event** — a logical certainty, not an inference — and is countable.

**Implementation shape (intelligence side, not part of the canonical write
path):**

```sql
-- conceptual; concrete MV definitions belong in a separate spec
SELECT
  v.id            AS visit_id,
  v.asset_id,
  r.id            AS possible_type_id,
  o.id            AS recorded_observation_id     -- NULL = silence
FROM core.visits v
JOIN core.observation_type_registry r
  ON r.asset_type_id = (SELECT asset_type_id FROM core.assets WHERE id = v.asset_id)
 AND r.active
LEFT JOIN core.observations o
  ON o.visit_id = v.id
 AND o.type_id  = r.id
WHERE v.outcome = 'completed';
-- NULL on the observation side = the silence. Counted, rolled up as
-- rate/trend over a window (per asset, per asset_type, per route, per day).
```

**What intelligence reads, and what it does not:**

- It reads **rate and trend** of asserted observations (actions performed,
  problem-flags raised, condition assertions made) against visit-completeness
  anchors.
- It does **not** read a per-visit arrival value. None exists in the schema by
  design (invariant #5).
- It does **not** infer a condition from the absence of an action. Absence is
  counted as silence, not interpreted as ok or not_ok.

The §3.5 spot check is the one row pattern that makes component-level silence
*specifically* safe to read as benign — it carries the worker's positive
assertion that the stop, as a whole, required no servicing. Without a spot
check, component-level silence on a completed visit is still countable, but
should be read as "nothing was asserted," not as "nothing was wrong."

---

## 5. What an adapter is, exactly

To stand up a new industry you provide three things, none of which are the core:

1. **Registry rows** — one per observation type: its kind, payload schema, OK-rule,
   severity map. (Transit: ~25 rows. Housing: a different set.)
2. **Capture UI** — the industry's field screens. Writes go through the canonical
   write path (§6), which validates against the registry and normalizes.
3. **ID translation** — a one-way resolve from the adapter's local identifier to a
   `core.assets.external_key`, done once at write time. Never an embedded join in a
   read query (that is the "contamination" defect to forbid).

Adapter-specific descriptive fields (route, building number, pole class) live in
adapter tables keyed by `asset_id`. They are never promoted into the core.

### 5.1 The adapter is bidirectional

The adapter translates **in both directions**:

- **On write:** org vocabulary → canonical facts. The capture UI speaks the
  industry's language ("wash the pad", "spot check"); the write path produces
  canonical condition / action / measurement / presence rows.
- **On read:** canonical facts → org vocabulary. The same observations are
  projected through multiple consumer surfaces, each in its own vocabulary:
    1. an **operational report** in org-native language (e.g. for KCM:
       "litter picked up", "trash emptied", "stop spot-checked"),
    2. **normalized signals** for the intelligence layer (rate/trend/silence
       counts against anchors),
    3. an **analyst MV surface** in org vocabulary for queryable rollups.

Nobody reads raw `payload`. Each consumer reads the projection suited to it.
The MV layer therefore serves a **dual role**: it is both the intelligence
performance layer and the queryable analyst surface in org-native vocabulary —
the same physical artifact, two callers.

---

## 6. The write path (where validation and normalization happen)

```
On observation submit (online or offline-sync reconcile):
  1. resolve adapter local id -> core.assets.external_key -> asset_id   (once)
  2. load registry row for (org, asset_type, type_key)
  3. VALIDATE payload against registry.payload_schema  -> reject if malformed
  4. (kind, status, severity, intervention)
       = normalize(registry_row, payload)                              (§4.2)
     # condition/measurement -> status grade
     # presence              -> status NULL (row existence is the signal)
     # action                -> status NULL, intervention populated
  5. INSERT core.observations with normalized columns + raw payload
  6. link any core.evidence rows to the new observation_id
```

**No row is ever written without the worker asserting it.** The write path is
never invoked at visit-start, never auto-populates a default arrival condition,
and never composes a paired before/after record (invariants #5, #6).

**Offline-first note (must be verified against live sync code):** because capture is
offline on tablets, validation cannot rely solely on a DB check constraint at the
moment of field entry. The robust pattern is: validate optimistically on-device
against a cached copy of the registry schema (fast feedback), then re-validate
authoritatively at server reconcile (source of truth). Rejected-on-reconcile rows
go to a quarantine/repair queue rather than silently failing. The registry schema
is versioned so a tablet that synced an old schema is detectable.

---

## 7. Why this is portable — worked example

The same engine, three industries, zero code change — only registry rows differ:

| Industry | type_key | kind | ok_rule / payload axis | What the row says |
|---|---|---|---|---|
| Transit | `shelter_condition` | condition | path=state, ok=[clean] | shelter graded clean / dirty |
| Transit | `pad_condition` | condition | path=state, ok=[clean] | pad graded clean / dirty |
| Transit | `spot_check` | condition | scope=stop, ok=[no_work_needed] | stop-level positive anchor (§3.5) |
| Transit | `trash_volume` | measurement | path=level, ok_max=1 | bin fill 0–4 |
| Transit | `washed_pad` | action | intervention='washed_pad' | the act of washing the pad |
| Transit | `picked_up_litter` | action | intervention='picked_up_litter' | the act of picking up litter |
| Transit | `graffiti_present` | presence | row exists = problem flagged | graffiti reported on this asset |
| Transit | `biohazard_present` | presence | row exists = problem flagged | biohazard reported on this asset |
| Housing | `unit_habitability` | condition | path=state, ok=[habitable] | unit livable / not |
| Housing | `replaced_smoke_detector` | action | intervention='replaced_smoke_detector' | the act of replacement |
| Housing | `water_damage_area` | measurement | path=sqft, ok_max=0 | water damage extent |
| Housing | `mold_present` | presence | row exists = problem flagged | mold reported |
| Utility | `pole_lean` | measurement | path=degrees, ok_max=5 | lean within tolerance |
| Utility | `vegetation_clearance` | condition | path=state, ok=[clear] | clearance maintained |
| Utility | `trimmed_vegetation` | action | intervention='trimmed_vegetation' | the act of trimming |

A query like "rate of `not_ok` condition assertions per asset over the last N
visits" is identical SQL for all three. A query like "rate of action
observations per asset over the last N visits, against the count of completed
visit anchors" — the degradation/maintenance signal — is also identical SQL
for all three. That is the product.

---

## 8. Scope discipline (what to build now vs. never-yet)

**Build now (transit needs it anyway, and it's the genuine JSON fix):**
- The four nouns with the normalized observation columns.
- The registry-as-contract (schema + kind + ok_rule + severity_map).
- The generic normalizer in the write path.
- The audit-only identity sidecar + the no-grant intelligence role.
- The `v_observation_normalized` read seam.

**Design-general but DO NOT build yet (the runway trap):**
- A second adapter. Don't. Transit proves the core.
- An adapter-registration UI / self-serve onboarding.
- Generalized capture screens.

The cost difference between "transit, hardcoded" and "transit as adapter #1 on a
general core" is mostly *naming and discipline decided up front* — not months of
work. Decided now: cheap. Retrofitted after the intelligence layer bakes in
assumptions: expensive. That asymmetry is the whole reason to settle the core's
shape before specing signals.

---

## 8a. Three queryable tiers for analysts

The canonical state layer exposes three queryable tiers, all of which remain
available to analysts. None replaces another; each answers a different class of
question, and access to the lower tiers keeps intelligence verifiable rather
than opaque.

1. **Raw canonical** — `core.observations` / `core.visits` / `core.assets` /
   `core.evidence`. The source of truth. Heterogeneous payloads; the unit-level
   facts as the field produced them. Analysts retain access so they can verify
   any aggregate against counts and reconcile any signal against the underlying
   rows.
2. **Normalized** — `core.v_observation_normalized` (§4.3). The two-axis read
   surface (`obs_kind` + kind-conditional `norm_status` + `intervention`).
   Industry-agnostic; the same SQL works across adapters.
3. **Aggregated MVs** — org-vocabulary rollups (e.g. KCM-language: "litter
   pickups per stop per week", "spot-check rate per route", "infrastructure
   issue flags per shelter cohort"). The MV tier answers ~95% of analyst
   questions efficiently; raw and normalized remain accessible for the
   remainder and for verification.

The MV tier is the **same artifact** the intelligence layer uses for
performance — see §5.1, the adapter-bidirectional note. One physical layer,
two callers.

---

## 8b. Daily operations report filter (downstream consumer example)

This section is recorded as a **consumer pattern**, not a build spec. It shows
what the operations layer derives from canonical state — proof that the schema
above is sufficient for the daily operational surface without a separate
"work-order" table.

The daily operations report surfaces only two categories of stop on a
completed route:

1. **Stops with a `not_ok` condition assertion** — work-order candidates.
   These are stops where the worker explicitly graded a component as not
   acceptable (e.g. `shelter_condition`/`pad_condition` with
   `norm_status='not_ok'`).
2. **Stops on the planned route with no `core.visits` anchor** — true
   non-service. The route was completed, but this stop has no visit row,
   meaning the worker never anchored their presence.

Two patterns are explicitly **excluded** from operational alerting and become
**intelligence accumulation** rather than operational signal:

- **Routine cleanings** (action observations such as `washed_pad`,
  `picked_up_litter`) — these are normal servicing, not exceptions to surface
  daily.
- **Spot checks** (§3.5) — a spot check is a **completed servicing visit**
  with outcome "assessed, no work needed." It is not a non-service event.

The only non-service visit outcome that appears on the operations report is
**`skipped` with `reason_code='safety'`**. Every other completed-but-quiet
visit is silence-as-signal feeding intelligence (§4.4), not an operational
alert.

---

## 9. Open questions to resolve against the live system before building

1. **(RESOLVED — superseded by §1 and invariants #3, #6.)** ~~Paired before/after
   ("dirty on arrival → clean on departure") as one transition vs. two state
   rows.~~ Resolved: the model stores two separate facts (a *condition*
   assertion if the worker grades something, and an *action* observation for
   any intervention performed), and the transition is **derived** by
   intelligence from the rate/trend of those facts within and across visits.
   Nothing in the schema represents an arrival/departure pair.
2. **(RESOLVED 2026-05-25.)** ~~Does the four-kind taxonomy cover every
   seeded observation type cleanly?~~ Resolved by the 2026-05-25 ratification
   sprint. All 25 originally-seeded types map cleanly to exactly one of the
   four kinds; the one ambiguous row (`stop_not_serviced_due_to_safety`,
   which was a duplicate of `core.visits.outcome='skipped'`) was retired
   under §2.1 (the umbrella anti-pattern), alongside `safety_concern_present`
   for the same reason. The registry now contains 30 rows (28 active, 2
   retired), all of which fit the four-kind taxonomy. See
   `docs/changelog/2026-05-25-state-layer-ratification-seeding.md` for the
   full mapping table.
3. **Where does write validation run given offline-first capture?** Verify how
   the current offline queue reconciles before committing to on-device + server
   re-validation (§6).
4. **Migration of existing rows.** Existing `core.observations` have
   heterogeneous payloads and no normalized columns. Backfill plan: run the
   normalizer over history once the registry rules exist. Decide whether
   backfill is in-place or a shadow column promoted after verification.
   Specifically: existing rows must be classified into condition / action /
   measurement / presence; rows that today look like "arrival state" — if any —
   must be reconciled against invariant #5 (no stored arrival state) and either
   reclassified or marked legacy.
5. **The `complexity_score` / ISSUE-008 recompute** rides on this: once
   `norm_status` exists on condition + measurement rows, "count of not_ok
   condition observations per asset over a window" is trivial and the dead
   column can be re-derived. Keep it a *consequence* of this work, specced
   separately.
6. **Identity sidecar grants.** Confirm the intelligence layer can run under a
   DB role with no grant on the actor-audit table without breaking existing
   reads.
