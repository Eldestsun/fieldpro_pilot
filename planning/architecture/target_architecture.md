# Target Architecture for Application

## Layer A — Canonical State Model (DB-Authoritative)

The database is the authoritative source of truth. The platform is defined by canonical state, not workflows.

### Canonical domains

* Organizations
* Assets
* Locations
* Asset-Locations
* Assignments
* Visits
* Observations
* Evidence

### Responsibilities

* Define identity and tenancy
* Preserve event truth (Visits)
* Preserve state truth (Observations)
* Bind evidence to visits
* Enforce that Assignments remain intent, not reality

---

## Layer B — Application and API Alignment Layer

Frontend and backend systems must align strictly to the canonical state model.

### Backend responsibilities

* Expose APIs that read/write canonical state correctly
* Eliminate workflow-shaped abstractions that conflict with Visits/Observations/Evidence
* Support compatibility bridges where required for live transit operations

### Frontend responsibilities

* Express workflows as Visit → Observation → Evidence flows
* Avoid UI semantics that imply “task completion = truth”
* Preserve offline-first guarantees while aligning data structures to canonical state

### Rule

Application code does not define truth. It must conform to the database truth model.

---

## Layer C — Intelligence Consumption Layer

Intelligence is strictly downstream of canonical state.

### Responsibilities

* Consume Visits, Observations, and Evidence-linked facts
* Produce explainable, reviewable, historically persistent signals
* Remain aggregate-only and labor-safe

### Constraints

* No worker attribution
* No hidden performance scoring
* No inference of truth when explicit visits exist
* No redefinition of core domains

---

## Architectural Mapping Rule

The target architecture defines logical separation of concerns, not required repository folders.

Implementation must map these concerns onto the existing repository structure (frontend, backend, data, planning, docs, ops) unless an explicit structural migration is approved.

## Layer D — Vertical Implementations

The canonical model supports multiple operational verticals. Each vertical is an adapter — it maps domain-specific workflows and UI language onto the canonical Visit → Observation → Evidence model.

### Transit Slice (Current Vertical Implementation)

Transit is the first and currently active vertical slice.

Transit-specific workflows, metadata, and semantics are implemented as adapters on top of the canonical model. They may not redefine the platform ontology.

Examples of transit-vertical adapters:
- `route_runs`, `route_run_stops` — transit workflow scaffolding; not canonical truth
- `clean_logs` — transit action log; canonical truth is in `core.observations`
- `stop_photos` — transit photo record; canonical truth will be in `core.evidence`
- `cleanLogService.ts` — transit-to-canonical translation bridge

Future verticals (parks, facilities, infrastructure inspection) follow the same pattern: build directly against the canonical model, do not extend `public.*` schema tables.

## 6. Domain-First Product Structure

The target system is structured by domains first, workflows second.

### Correct ordering

1. Core truth domains
2. Intelligence derivation domains
3. Application surfaces
4. Vertical workflow adapters
5. Compatibility bridges

### Incorrect ordering

* Today’s route first
* Stop detail first
* Dashboard first
* Transit stop semantics first

Those are workflow expressions, not the architecture.

### UI language vs. backend contract

This ordering is **structural and architectural**, not prescriptive of UI language or labeling.

The frontend does not need to expose terms like “Observation,” “State,” or “Evidence” to users. UI workflows may use domain-appropriate language (“clean,” “issue,” “complete stop”). Vertical slices act as semantic adapters between UI language and canonical state.

The enforcement point is the **backend contract** — every field interaction must produce canonical structures (Visits, Observations, Evidence), regardless of how the UI describes the action to the worker.

## 7. Workflow Positioning in the Target Architecture

Operational workflows still matter, but they are consumers of the domain model.

### Example: UL stop workflow

The UL does not “complete a stop” as the primary architectural concept.

Instead, the workflow:

* enters a visit
* captures observations
* attaches evidence
* records outcome and reason if relevant
* closes or leaves the visit state as appropriate

### Example: Lead coordination

Leads manipulate assignments, route composition, and operational intent.
They do not define truth; they manage execution context around truth capture.

### Example: Control Center

The Control Center is a truth surface that answers:

* what was planned
* what actually happened
* what broke the plan
* what still requires attention

It remains aggregate-only and non-attributive.

## 8. Intelligence Positioning

The target architecture assumes intelligence is downstream of canonical state.

> **Detailed expansion.** The data-architecture authority for how the four canonical nouns (assets, visits, observations, evidence), the observation type registry, and the normalized observation columns enforce the constraints below is `CANONICAL_STATE_LAYER_DESIGN.md` (this directory). The mechanisms in particular: (a) intelligence reads only the normalized columns (`obs_kind` / `norm_status` / `norm_severity`), never `payload` — §3.3, §4.3; (b) worker identity lives in an audit-only sidecar that the intelligence DB role has no grant on, making non-attribution a permission-layer guarantee rather than a code-review rule — §3.2. **Status: the normalized observation shape (mechanism (a)) LANDED 2026-06-14 (CANON-NORM Steps 1–6) and is verified live — treat its normalized-column DDL as ratified. The identity-sidecar boundary (mechanism (b)) exists at the DB level (2026-06-01); its app-connection wiring is the one remaining target-state step (ISSUE-018). Consult §9 of the design doc for the current-vs-target status of any specific guarantee.**

### Intelligence must be:

* explainable
* reviewable
* historically persistent
* role-scoped
* labor-safe

### Intelligence must not be:

* black-box worker scoring
* routing-only magic
* dependent on inferred visits when explicit visits exist
* the architectural center of the platform

## 9. Platform Posture

BASELINE is operational infrastructure, not a standalone application.

* It coexists with EAM and CMMS systems — it does not replace or duplicate them
* Field workers should not experience it as a form-filling system; it captures truth as a byproduct of work
* The Control Center is a coordination surface (planned vs. actual vs. needs attention), not an executive dashboard
* New features must reduce operational burden; features that add administrative complexity require explicit review
* Features that would enable worker surveillance, individual performance ranking, or punitive metrics are permanently out of scope — not deferrable

BASELINE drifts toward the wrong product if it starts accumulating: dashboard bloat, CMMS duplication, ERP-style administrative workflows, or excessive form-driven UX. These are failure modes, not enhancements.

---

## 10. What the Refactor Removes

The target architecture intentionally removes or contains:

* Transit-first architectural leakage
* “Clean log = visit” assumptions
* Workflow-shaped core structure
* Intelligence based primarily on implied presence
* Product boundaries inherited from implementation history rather than ontology

## 11. What the Refactor Preserves

The target architecture preserves:

* Stable Live execution behaviors
* Offline-first guarantees
* Deterministic route assignment and reassignment
* Existing labor-safe guardrails
* Operational truth surfaces already proven valuable
* Existing mature domain knowledge captured in the current system

## 12. Target Architecture Success Criteria

The architecture is correct when:

* BASELINE can be explained without centering transit workflows
* Visits, observations, and evidence are the obvious platform center
* Intelligence reads naturally as a consumer of state truth
* New verticals can be imagined without reworking the core model
* The current app can be mapped into the new structure without redefining the structure
* Labor-safe semantics remain enforced by design, not policy alone
