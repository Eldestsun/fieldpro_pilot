# ISSUE-031 Redesign — Multi-Tenant & Multi-Vertical Architecture Decision Record
 
> **Type:** Architecture decision record (durable). Establishes the principles, the
> target shape, and the decisions the classification pass and every subsequent dispatch
> run against. Supersedes loose reasoning in prior chat sessions.
> **Date:** 2026-06-07
> **Stands on:** `2026-06-06-transit-adapter-complete-inventory.md` +
> `2026-06-06-canonical-core-complete-inventory.md` (both sides of the bridge, live-verified).
> **Scope frame:** This is the *target* and the *principles*. The migration sequence
> (what moves first, what prep) is a separate artifact written against this one.
 
-----
 
## 0. The one sentence everything hangs on
 
**Canonical learns no vertical’s vocabulary, and core knows no worker’s name** — and both
are enforced by *where data lives and who has grant*, not by anyone’s discipline or good
intentions. Every decision below is an application of that sentence.
 
The product is a living digital twin of physical-asset condition that any asset-owning
organization can run. Two independent axes of generality must hold:
 
- **Multi-tenant** — many organizations in one database, structurally isolated. The fast
  second customer (another transit agency, via the Deputy GM’s national network) needs
  THIS and almost nothing else from this document.
- **Multi-vertical** — transit, parks, DOT, hospitals, casinos, utilities sharing the same
  canonical core. The slow second customer (different domain) needs this; it falls out of
  the ISSUE-031 redesign largely for free, IF we hold the line below.
These are different axes with different urgency. We build the fast one to robustness and
the slow one to not-foreclosed.
 
-----
 
## 1. What “adapter” means (the definition that ends the ambiguity)
 
An adapter is a **translation layer between one vertical’s language and the canonical
language.** It is disposable by design — you write a new one per vertical and throw it
away when a vertical leaves. Its disposability is precisely what makes canonical valuable.
 
An adapter does exactly three jobs and no others:
 
1. **Ingestion translation (one-way, at onboarding).** Takes the vertical’s native
   asset/location representation (transit `stop_id`, `bay_code`, a GIS object id, a lat/lon)
   and translates it into canonical rows (`core.locations`, `assets`, `core.asset_locations`).
1. **Operational scaffolding (live, never feeds canonical truth).** The vertical-specific
   routing/workflow state that is meaningless to other verticals — route runs, pools,
   shifts, the operational flags. It organizes how *this* vertical’s workers move through
   *this* vertical’s work. It NEVER becomes a source of canonical fact.
1. **Outbound translation (canonical → vertical, at the boundary).** When canonical truth
   must be expressed back in the vertical’s language (the `v_*_transit` views, the EAMS
   bridge), the adapter translates at the edge.
**The test for adapter vs canonical:** *would the next vertical understand this word?*
A hospital has no `bay_code` and no `route_run` → adapter. A hospital absolutely has a
location, an asset, an observation, a visit → canonical. The instant `core` learns a
transit word, it has stopped being multi-vertical.
 
**Many vertical-specific ingestion surfaces → one canonical spine.** Verticals do NOT
share `transit_stops`. Parks gets its own ingestion surface with parks columns; transit
keeps `bay_code`/`num_shelters` on `transit_stops`. Both adapters write into the *same*
generic `core.locations` + `assets`. Genericization happens at the translation step, not
by flattening every vertical into one vertical’s table.
 
-----
 
## 2. The contamination we found, and the rule it produces
 
The canonical *tables* are already clean: `core.locations.location_type` and
`core.location_external_ids.source_system` are parameterized, not hardcoded enums. Good.
 
**But the translation VIEWS are contaminated and misfiled.** Six `core.v_*_transit` views
live in the `core` schema, named `*_transit`, filtering `WHERE location_type='transit_stop' AND source_system='metro_stop'`. Those are transit-vertical concepts sitting inside the
canonical schema. A Parks user querying `core` should never see a `v_locations_transit`.
 
**RULE (CANON-1):** `core` contains zero vertical-specific names and zero vertical-specific
filters. Translation views are adapter objects. They move OUT of `core` into the adapter’s
namespace (a per-vertical schema, e.g. `transit`, or `public` as adapter objects — decided
in §7). Each vertical’s adapter provides its own translation views filtering to its own
`location_type`/`source_system`. Parks gets `transit`-equivalent views in its own namespace.
 
This single move is what makes the multi-vertical claim *structurally true* rather than
aspirational. The tables are already generic; it is the view placement that betrays the layer.
 
-----
 
## 3. The decisions, settled (Q-A through Q-G)
 
|ID                     |Decision                                                                                                                                                                                                                                                                                                                                                                                                                     |Status                          |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------|
|**Q-A/Q-B**            |Canonical spine becomes load-bearing for stop identity/geometry/asset-linking. `transit_stops`/`transit_stop_assets` demote to **vertical ingestion source + operational flags**, no longer the live system-of-record for asset↔location. Live reads invert onto `core.asset_locations`/canonical location views.                                                                                                            |**SETTLED**                     |
|**Q-A/Q-B (corollary)**|The `_transit` translation views are evicted from `core` (CANON-1, §2).                                                                                                                                                                                                                                                                                                                                                      |**SETTLED**                     |
|**Q-C**                |Run↔visit linkage stays a **string translation** (`assignments.source_system='route_runs'` + `source_ref`=route_run id), NOT a hard FK from canonical into the adapter. Canonical must never FK into a vertical. Harden it: index the `(source_system, source_ref)` pair, validate at write, add a 1:1 integrity regression test. Promote from “incidental join that works” to “declared, tested canonical↔vertical linkage.”|**SETTLED**                     |
|**Q-D**                |Evidence write path (`stop_photos` + `core.evidence` + `core.evidence_actor_audit`) becomes **one transaction**, matching the visit/observation/assignment paths. Orphan-identity (a committed `evidence_actor_audit` row whose evidence failed) is the one inconsistency a labor-safe-by-structure system can never ship. Bug fix, not architecture.                                                                        |**SETTLED**                     |
|**Q-E**                |Sidecar encryption made **uniform** across all four sidecars (today only `visit_actor_audit` carries the cipher envelope). Decoupled from the clip — separate issue, sequenced before TPRA needs to be airtight, but does not block the migration. Touch-once: if the sidecars are opened during the redesign, encrypt then.                                                                                                 |**SETTLED (sequenced separate)**|
|**Q-F**                |Export channel (`exportDeleteRoutes`, `sftpExport`) moves onto `audit_reader` (currently NOLOGIN/unwired, ISSUE-028) instead of reading sidecars as `fieldpro`. Folds into the permission model.                                                                                                                                                                                                                             |**SETTLED (depends ISSUE-028)** |
|**Q-G**                |`mcp_readonly` **revoked to canonical-only** (the `intelligence_reader` surface). No exemption. A LOGIN role with plaintext-OID sidecar + `identity_directory` access contradicts the auditable-by-grant claim.                                                                                                                                                                                                              |**SETTLED**                     |
 
**On the sidecar pattern itself:** confirmed CORRECT, not a workaround. Identity isolation by
GRANT (`intelligence_reader` has none, verified by absence; no view reaches a sidecar) is the
moat. Q-D/Q-E/Q-F/Q-G are a *finishing punch list* on a sound mechanism, not a reason to
reconsider it.
 
-----
 
## 4. Multi-tenant readiness — the FAST second customer
 
This is the work that bites *immediately* with any second org and is mostly correctness, not
perfection. The fast second customer is almost certainly another transit agency (the entire
distribution path is Ernest’s national transit network), so they flow into the *existing*
transit adapter — they need tenancy robustness, not a new vertical.
 
**MT-1 — Fix the org-resolution fallback (ISSUE-013).** `resolveNumericOrgId` falls back to
the lowest-id org when the caller’s org is indeterminate. Safe in single-org dev/pilot;
**a cross-tenant data-leak landmine the instant a second org exists.** Promote from “on the
horizon” into the redesign scope. Small change, highest-consequence multi-tenant bug.
 
**MT-2 — Resolve the RLS fail-open posture (PATTERN-001).** Every table (canonical, adapter,
AND the sidecars) carries the same `org_isolation` policy that **fails OPEN** when
`app.current_org_id` is unset (the disjunct is true → all rows visible). Today this is
“mitigated” by callers setting org context (`withOrgContext`) or running as BYPASSRLS. With
one tenant, an unset-context bug shows zero rows (PATTERN-001’s documented trap) or, worse on
a superuser pool, all rows. With two tenants, an unset-context read on a shared pool can
return the *other tenant’s* rows. **Decision needed in the redesign:** move to fail-CLOSED
(unset context → zero rows, the safe direction) and make every read path that legitimately
needs cross-org access (the risk job, exports) use an explicit, named, audited role rather
than relying on fail-open. This is the single biggest multi-tenant correctness item and it
interacts with ISSUE-018 (intelligence_reader wiring) and the bare-pool read paths.
 
**MT-3 — Onboarding-as-data, not onboarding-as-code.** A second transit org must be standable
through seed/admin paths *as data* (its stops → `transit_stops` + canonical spine, its
`asset_types`, its `observation_type_registry` rows, its pools/bases) WITHOUT code edits. The
asset/observation type registries are already meaning-as-data (good). **Verify (or build)**
that the stop-ingestion + canonical-seed path is org-parameterized end to end. The difference
between “second transit client is a week” and “a month.”
 
**MT-4 — `org_id` type consistency.** `export_delete_tokens.org_id` is `text` while every other
`org_id` is `bigint` (its RLS policy does text comparison). Minor, but a multi-tenant
correctness audit will flag the inconsistency. Normalize during the redesign.
 
-----
 
## 5. Multi-vertical readiness — the SLOW second customer
 
This largely falls OUT of the ISSUE-031 redesign for free, because the clip + spine inversion +
view eviction (§3 Q-A/Q-B, §2 CANON-1) already produce a vertical-blind core. The remaining
multi-vertical items are about *not foreclosing* the gaps we deliberately defer.
 
**MV-1 — Vertical-blind core (DONE BY THE REDESIGN).** After CANON-1 and the spine inversion,
`core` has no `_transit` names, no vertical filters, generic parameterized
`location_type`/`source_system`, and meaning-as-data registries. This IS the multi-vertical
substrate. No separate project.
 
**MV-2 — Spatial geometry: DEFER, but do not deepen lat/lon (the only now-or-never item).**
`core.locations` stores `lon double precision, lat double precision`. This serves transit
(points) completely and serves the fast (transit) customer fully. It silently forecloses
verticals whose assets are not points (hospital room = polygon, DOT guardrail = linestring).
The perfect answer is PostGIS `geography`/`geometry`, where a point is the degenerate case.
 
- **Cost is infra, not data:** `CREATE EXTENSION postgis`, one column, one UPDATE over 14,916
  seeded rows (re-seedable — no real data exists). The hard part is PostGIS present in every
  environment (local Docker image, Render, Azure DB for PostgreSQL — all support it) and that
  it naturally pairs with the **PG15+ bump already owed by ISSUE-029** (security_invoker views).
- **Decision:** DEFER actual PostGIS adoption to the PG15 bump (post-pilot, before any
  non-point vertical). **Discipline NOW:** the redesign must not write new code that deepens
  lat/lon point-assumptions (no new `lat`/`lon` float columns on canonical, no point-only
  distance math baked into canonical reads). Keep the geometry retrofit a contained
  afternoon-plus-infra job, never a rewrite.
**MV-3 — Typed/registry-validated observations: DEFER, additive only.** `observation_type` is
free text with no registry FK/CHECK; `severity`/`status` nearly unused; the four-kind taxonomy
lives in code, not the table. For a digital twin this is the difference between computable data
and a pile of strings — but it is incremental (tightening types on a few dozen rows is always
cheap) and has no hard deadline. **Critical constraint:** the worker (UL) UI is FROZEN. Any
validation must be *additive* — canonical validates what the existing capture endpoint already
sends, never imposes a new contract the frozen UI must meet. Defer the normalized
`obs_kind`/`norm_status` columns; land registry-FK + write-time validation when convenient,
additively.
 
**MV-4 — Condition state as first-class canonical: OPPORTUNISTIC (cheap + demo-relevant).**
The derived condition layer already exists as `stop_effort_history` + `stop_condition_history` +
`stop_risk_snapshot` — but transit-named, in `public`, keyed on `stop_id`. Because it is
*derived from observations*, it regenerates: no data migration, ever. Promoting it to
vertical-blind `core` tables keyed on `asset_id`/`location_id` is a rename-relocate-and-rebuild.
This is the layer that turns “clean DB” into “sellable twin” and the layer robotics/AI plug
into. **Fold in opportunistically** — it is nearly free and it is exactly what a deputy-director
demo shows. Discipline: it stays *derived* (rebuildable from observations), so it can never
drift and identity can never sneak in.
 
-----
 
## 6. The target shape
 
```
core  — vertical-blind, the part that NEVER changes per vertical
  locations            location_type parameterized; geometry lat/lon TODAY,
                       PostGIS-ready LATER (MV-2); spine becomes load-bearing (Q-A/B)
  location_external_ids source_system parameterized; the stop_id↔location_id translation data
  assets               canonical registry (lives in public, IS canonical — load-bearing FK target)
  asset_locations      temporal asset↔location link; becomes the LIVE read path (Q-A/B)
  asset_types          per-tenant type registry (meaning-as-data)
  observation_type_registry  meaning-as-data; validates observations (MV-3, deferred)
  visits               when/outcome, NEVER who; the labor-safety anchor
  observations         condition atoms; typed-validated LATER (MV-3)
  evidence             proof refs; write made atomic (Q-D)
  assignments          plans; linked to verticals by string translation, hardened (Q-C)
  [condition_state + history]  derived twin projection, promoted from public (MV-4, opportunistic)
 
core identity sidecars — grant-isolated; intelligence_reader has NO grant (verified)
  visit/observation/evidence/assignment _actor_audit
  uniform encryption (Q-E); export reads via audit_reader (Q-F); mcp_readonly revoked (Q-G)
 
admin  — NEW schema (does not exist today)
  identity_directory   OID→name+email; relocated from public; audit_reader-only
 
[transit] adapter — DISPOSABLE, one per vertical
  transit_stops        ingestion source + operational flags (is_hotspot, compactor, has_trash);
                       NO LONGER the live asset↔location system-of-record (Q-A/B)
  transit_stop_assets  ingestion-time translation seed (demoted from live path)
  route_runs           keeps assigned_user_oid + created_by_oid (D2 — assignment intent ≠
                       work-attribution, openly known in any transit op)
  route_run_stops, route_pools, stop_pool_memberships, bases, lead_route_overrides
  v_*_transit views    EVICTED FROM core (CANON-1); become transit-adapter translation objects
 
CLIPPED ENTIRELY (canonical holds the truth; rebuilt UI reads it identity-free per core §6.3)
  clean_logs, hazards, infrastructure_issues, level3_logs, stop_photos, trash_volume_logs
```
 
**Operational flags note (from founder, recorded):** `compactor` = a garbage truck empties this
can; `has_trash` = the route spec must service this can because no truck does; `is_hotspot` =
consistently bad, many issues. `compactor`/`has_trash` are transit-cleaning-operational, no
canonical analog → stay vertical permanently. `is_hotspot` is *almost* canonical (“chronically
bad asset” is something every vertical wants) → keep the flag vertical NOW, but do not enshrine
it as transit-forever; the generic derived version is a future canonical-intelligence candidate
(relates to MV-4). Do not build the generic version now.
 
-----
 
## 7. Open design questions for the founder (before the migration-sequence artifact)
 
These are the decisions that the *next* artifact (migration sequence) needs settled. Not
recommendations — the choices the redesign cannot make for you.
 
- **DQ-1 (adapter namespace):** Do the evicted `v_*_transit` views (and future per-vertical
  translation views) live in a dedicated per-vertical schema (`transit.*`, `parks.*`) or stay
  in `public` tagged as adapter objects? A dedicated schema makes the multi-vertical boundary
  visually obvious and grant-scopable per vertical; `public` is less churn now. Recommendation
  leans dedicated schema (it makes CANON-1 enforceable by schema grant), but it is more move-work.
- **DQ-2 (fail-open → fail-closed, MT-2):** Flipping RLS to fail-closed is the correct
  multi-tenant posture but touches every read path that currently relies on fail-open +
  BYPASSRLS (the risk job, exports, control-center bare-pool reads). Do we flip it as part of
  ISSUE-031, or as a dedicated tenancy-hardening issue sequenced right after? It interacts with
  ISSUE-018 (intelligence_reader wiring) — they may want to land together.
- **DQ-3 (spine write-back, Q-A/B):** When the canonical spine becomes load-bearing, what writes
  `core.locations`/`core.asset_locations` when a stop’s geometry or asset-linkage changes? Today
  they are seed-only (no live write path). The transit adapter’s `transit_stops` has the live
  flag-update writes. Does stop-geometry edit flow adapter→canonical (re-translate on change), or
  does the canonical spine get a direct admin write path? This is the concrete mechanism of the
  inversion and must be specified before reads are repointed.
- **DQ-4 (clip vs MV-4 timing):** The clipped tables (`clean_logs` et al.) and the to-be-promoted
  condition tables (`stop_effort_history` et al.) are touched in the same migration neighborhood.
  Do we promote condition-state to canonical (MV-4) in the same pass as the clip, or clip first
  and promote in a fast-follow? Promoting same-pass is touch-once but widens the blast radius of
  one migration.
- **DQ-5 (which items are IN ISSUE-031 vs adjacent issues):** ISSUE-031 is “complete the canonical
  migration / clip work-attribution.” MT-1 (ISSUE-013), Q-E (encryption), Q-F/ISSUE-028
  (audit_reader), MV-2 (PostGIS/PG15+ISSUE-029) are arguably their own issues that this ADR
  coordinates. Confirm the issue boundaries so dispatches reference the right tracking id.
-----
 
## 8. What this ADR deliberately does NOT do
 
- Does not gold-plate before the pilot. Spatial (MV-2) and typed observations (MV-3) are
  deferred to natural future bumps; only their *non-foreclosure* is enforced now.
- Does not build for scale unearned. The fast customer (transit MT) gets robustness; the slow
  customer (vertical MV) gets not-foreclosed. We do not build PostGIS for a hypothetical hospital
  ahead of a signed transit pilot.
- Does not reconsider the sidecar (it is the moat, confirmed) or re-decide D1/D2 (settled in the
  core inventory: `public.assets` is canonical infra; completion timing is reconstructable from
  core alone).
- Does not specify the migration sequence — that is the next artifact, written against this one,
  after DQ-1..DQ-5 are answered.
-----
 
*The discipline that makes all of it true, restated: canonical learns no vertical’s vocabulary,
and core knows no worker’s name — enforced by where data lives and who has grant, not by good
intentions. Multi-tenant for the customer you’ll get fast; multi-vertical not-foreclosed for the
one you might get slow.*
