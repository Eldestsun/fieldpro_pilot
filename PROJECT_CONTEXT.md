# BASELINE — Project Context & Session Instructions

> Load this file at the start of every working session alongside `CLAUDE.md`.
> This file covers what BASELINE is, why it exists, who built it, and what
> every session must optimize for. CLAUDE.md covers task routing and code rules.
> These two files together are the complete session briefing.

---

## What BASELINE Is

BASELINE is a Field Operations Intelligence System. It is a **state layer**, not
a work order system. All operational data captured in the field attaches to the
**asset** (bus shelter, trash receptacle, transit center) — not to a work order
with a worker's name on it.

This is the core architectural decision that makes everything else possible.

It is built to coexist with EAMS (Hexagon Enterprise Asset Management System),
not compete with it. EAMS is the system of record for assets that generate
telemetry. Bus shelters don't generate telemetry. Only the worker can assess
their condition. BASELINE is the ground-truth collection layer that makes the
EAMS investment perform better for this asset class.

The pitch is never "replace EAMS." The pitch is "here is the missing capability
that makes your $17M investment work for field-condition assets."

---

## Why Labor Safety Is Non-Negotiable Architecture

King County Metro's route specialists (cleaning crew workers) are unionized.
The union's concern is that stop-level data collection — service time, stop
sequence, completion rate — can be used to build per-worker performance
profiles, which they correctly identify as surveillance.

BASELINE's answer is structural, not policy-based:

- **Worker identity does not exist in the intelligence layer.** The tables
  `stop_effort_history` and `stop_condition_history` are keyed by `(stop_id,
  visit_id)`. There is no `user_id` column. A SQL query against these tables
  cannot produce a per-worker profile because worker identity is not in them.

- **`captured_by_oid` exists at the visit level** for system security and audit
  purposes only. It is held at a separate access tier. No application surface
  exposes it. The operational dashboard a chief or superintendent sees contains
  zero worker identity — only asset condition and route completion state.

- **The access trail is the deterrent.** Reaching OID-level visit data requires
  direct DB access (IT-provisioned, logged) or Azure Entra (even more visible
  trail). This transforms any bad-actor use from "I noticed a pattern" into
  documentable targeted surveillance — a meaningful deterrent.

Every session must treat labor safety guardrails as **hard constraints**, not
preferences. No feature, refactor, or schema change may introduce:
- Per-worker performance rankings or scores
- Worker comparison surfaces of any kind
- GPS tracking or location displays for workers
- Any `user_id` column on intelligence-layer tables
- Any surface that would allow a superintendent to profile an individual worker

---

## Who Built This and Why It Matters

The founder started as a route specialist — cleaning bus shelters. He was injured
and placed on transitional duty. He has 10 years of inventory control experience
with Excel and SQL, owns a digital marketing business, and built BASELINE because
he experienced the problem firsthand on the route.

He has recently been promoted to a business analyst position on the Transit
Facilities Division analytics team. He has approximately one year in this role
to demonstrate value and create the conditions for a paid pilot.

**This origin is a strategic asset, not a liability.** He is the only person
in the room who has cleaned a bus shelter and can also read a query plan. That
domain-knowledge bridge — between field reality and analytical infrastructure —
is what makes BASELINE credible in ways a vendor product cannot be.

**The ethical lines are already drawn and must stay drawn:**
- Full disclosure of product ownership to the chief and superintendent was made
  early and directly.
- The analytics role is performed on its own merits. The role is not used to
  advance the product through the backdoor.
- The product enters organizational conversation only when someone asks whether
  a solution exists — disclosure first, product second, never the other way.

---

## The Strategic Context

The organization is currently running story card meetings with Facilities Division
about rolling out EAMS mobile capabilities within the next 12 months. That mobile
rollout will attempt to capture stop-level data from route specialists. The union
will not accept it if it reads as worker monitoring — and the EAMS mobile UI is
not designed for a field worker completing 40 stops in a shift.

The window is: before the rollout hits friction, position BASELINE as the
labor-safe solution to the exact problem they are about to have. Not as a
competitor. As the capability they're missing.

**The goal for every session:** Build an application so functionally complete,
so labor-safe by structure, and so clearly differentiated from the EAMS work-order
model that the only honest organizational answer is yes.

---

## Current Build State

As of 2026-05-08, all Tiers and Refinement items are either Not Started or
Blocked. Nothing has shipped yet. The full execution roadmap lives in:

- `planning/REFACTOR_INDEX.md` — Tiers 1–6, canonical model migration
- `planning/REFINEMENT_INDEX.md` — R1–R10, production-grade + pitch-ready

### Unblocked work (can start immediately, in priority order):

| Item | Type | Why First |
|------|------|-----------|
| Tier 1 | Refactor | Unblocks Tier 2, Tier 5, R2, R7. The canonical write path is the foundation of everything. |
| Tier 3 | Refactor | Unblocked, frontend-only, low-risk. Mounts the already-built Control Center. |
| Tier 4 Sub-task A | Refactor | Unblocks Tier 2. Renames `stops` view columns to lowercase. |
| Tier 4 Sub-task B | Refactor | Unblocks R10. Drops surveillance tables, creates replacements. |
| Tier 6 Sub-task A | Ops | Unblocked. Migration runner — needed before anything else deploys. |
| Tier 6 Sub-task D | Ops | Unblocked. Remove hardcoded localhost. Required for containerized deployment. |
| R1 | Refinement | Unblocked. Replace `user_id = 123` stubs. Unblocks R7. |
| R3 | Refinement | Unblocked. Frontend router. Unblocks R5 (enterprise UI). |
| R4 | Refinement | Unblocked. Offline UX visibility layer. Worker-facing quality. |

### Blocked until Tier 1 completes:
Tier 2, Tier 5, R2, R7

### Blocked until R3 completes:
R5 (Enterprise UI), R9 (Frontend Tests)

### Blocked until Tier 4B completes:
R10 (Stop Effort History)

### Blocked until Tier 6C completes:
R8 (CI Pipeline)

---

## Execution Principles for Every Session

**1. The DB is the source of truth.**
UI and API are adapters. Schema decisions are architecture decisions.
Every canonical write is additive — existing transit writes are never removed
until their canonical replacement is verified in production.

**2. Additive discipline.**
Never remove a working write path to make room for a canonical one.
The pattern is always: new canonical write + existing transit write, both active,
until Tier 2 verifies intelligence reads cleanly from canonical state alone.

**3. No task is done without a changelog entry.**
`docs/changelog/YYYY-MM-DD-{slug}.md` is written before any tier or refinement
item is marked complete. No exceptions.

**4. Required reads are not optional.**
`planning/architecture/target_architecture.md` and `current_state.md` are read
before any code-touching task. The workspace `CONTEXT.md` is read before acting
in that workspace. Skipping reads produces regressions.

**5. Frozen files stay frozen.**
`authz.ts`, `AuthContext.tsx`, `msalConfig.ts` — auth is frozen.
`offlineQueue.ts`, `photoStore.ts`, `stopDraftStore.ts` — offline contract is
frozen. These are not touched under any circumstances in the current build cycle.

**6. Transit-first patterns are not reintroduced.**
The application started as a transit vertical. The canonical model is universal.
Any pattern that hardcodes transit assumptions into the platform layer is a
regression, not a feature.

**7. Labor safety guardrails are architecture, not policy.**
If a proposed change introduces worker identity into the intelligence layer —
even indirectly — it is rejected, not modified. The structural guarantee is the
whole point.

---

## Terminology Reference

| Term | Meaning |
|------|---------|
| Route Specialist / Route Spec | Field worker who cleans bus shelters. The primary UL (Unit Lead) user. |
| UL | Unit Lead — the field worker role in the app |
| Lead | Supervisor who creates and assigns routes |
| Chief / Superintendent | Operational management. Has dashboard access. Does NOT have DB access. |
| EAMS | Hexagon Enterprise Asset Management System — King County Metro's $17M system of record |
| Transit Facilities Division | The KCM division where BASELINE is being built and piloted |
| Canonical layer | `core.visits`, `core.observations`, `core.evidence`, `core.assignments` — the truth tables |
| Transit adapter layer | `route_runs`, `route_run_stops`, `clean_logs`, `stop_photos` — the execution scaffolding |
| Intelligence layer | `riskMapService.ts`, `stop_risk_snapshot`, `stop_effort_history`, `stop_condition_history` |
| OID | Azure Entra Object ID — the canonical worker identity field. Never exposed in operational surfaces. |
| State layer | BASELINE's architectural model: data attaches to assets, not work orders |
| Vertical slice | Transit stop cleaning is the first use case. The platform is not transit-specific. |

---

## Hosting Strategy and Deployment Timeline

### Hosting (decided 2026-05-18)

| Environment | Platform | Purpose |
|-------------|----------|---------|
| Testing / demos | Render | Internal debugging, field demos, pre-pilot validation |
| Pilot / contract | Azure Enterprise | Contracted pilot deployment. TPRA package commits to Azure Enterprise. |

TPRA documents and compliance claims are written against the Azure Enterprise commitment. Render is not a compliance target.

### 3-Month Timeline to Pilot-Ready

| Phase | Duration | Focus |
|-------|----------|-------|
| Debug | 2 weeks | Fix open issues, stabilize Render deployment, validate RLS end-to-end |
| UI/UX redesign | 2 weeks | Field worker flow improvements identified in pre-pilot testing |
| Azure migration | — | Provision Azure Enterprise environment, deploy stack, run migrations |
| Azure testing | 2 months | Field validation, KCM Entra SSO integration, TPRA submission window |

**Pilot-ready and TPRA-ready are synced milestones, not sequential.** The application enters the KCM IT review process at the same time the pilot field test begins.

---

## Route Pool Architecture (updated 2026-05-18)

The stop-to-pool relationship is now managed via a dedicated junction table.

### `stop_pool_memberships`

Many-to-many mapping of stops to pools, with shift-specific eligibility:

| Column | Type | Notes |
|--------|------|-------|
| `stop_id` | text | PK (composite) |
| `pool_id` | text | PK (composite) |
| `org_id` | bigint NOT NULL | RLS-protected |
| `shift_type` | text DEFAULT NULL | `day` / `night` / `all_day` |
| `active` | boolean DEFAULT true | Soft-delete |
| `created_at` | timestamptz | — |

`transit_stops.pool_id` is **retained as a deprecated denormalized cache** for backwards compatibility. The authoritative stop-to-pool relationship is `stop_pool_memberships`.

### Shift support

`route_runs.shift_type` (text: `day` / `night` / `all_day`) supports day/night route separation. `stop_pool_memberships.shift_type` enables stops to be eligible for specific shifts within a pool.

---

## What "Pitch-Ready" Means

The pilot audience is King County Metro Transit Facilities Division leadership.
They have just invested $17M in EAMS. They are in active planning for EAMS mobile
rollout. They have union obligations and labor relations constraints.

"Pitch-ready" means:

- **The field UI is frictionless.** A route specialist completes a stop faster
  with BASELINE than without it. Data capture is a byproduct of work, not a
  separate task.

- **The labor safety story is demonstrable.** An evaluator can open the DB,
  run a query against `stop_effort_history`, and confirm with their own eyes that
  there is no `user_id` column. The guarantee is visible, not promised.

- **The Control Center is operational.** A dispatcher can watch route progress
  in near-real-time without refreshing. Exceptions surface without someone
  calling in.

- **The canonical model is populated.** Risk maps and condition history are
  meaningful from day one of any demo because the historical backfill (R7) has
  run and the intelligence layer reads from canonical state (Tier 2).

- **The application deploys cleanly.** Docker, CI, migration runner — the
  infrastructure exists and the app can be stood up in a new environment in
  under an hour.

Every session contributes to one or more of these five outcomes.