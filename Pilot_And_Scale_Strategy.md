# BASELINE — Pilot Readiness, Go-to-Market, and Scale Strategy

> This document captures the strategic and operational decisions made in the
> planning session of 2026-05-09. It lives alongside PROJECT_CONTEXT.md and
> CLAUDE.md as a required read for any session touching pilot preparation,
> pricing, deployment, or multi-agency planning.
>
> Last updated: 2026-05-09

---

## The Non-Negotiable Pilot Gate

**BASELINE does not go to pilot until Tier 2 is complete and verified.**

This is not a timeline preference. It is an architectural requirement.

The canonical state layer is not a feature of BASELINE. It is the product. The
labor safety guarantee — the structural proof that worker identity does not exist
in the intelligence layer — only holds if the intelligence layer reads exclusively
from `core.observations` and `core.visits`. A deployment where `riskMapService.ts`
still reads from `level3_logs`, `hazards`, and `clean_logs` is not BASELINE. It
is a transit cleaning app with a UI on top of a surveillance-adjacent schema.

The non-negotiable critical path to pilot:

```
Tier 1 (canonical write paths complete and verified)
    ↓
Tier 2 (intelligence migration complete, parallel verification period done,
        legacy CTE removed, score distributions comparable)
    ↓
Pilot-eligible
```

No agency, no pilot, no demo that implies production readiness until this
chain is verified end to end. Every other tier and refinement item runs
alongside this chain — none of them move it forward or replace it.

---

## The Pre-Pilot Shadow Period

A pilot that starts with an empty canonical layer is not the product being sold.
A risk map with no condition history, a Control Center with no visit data, and
an intelligence layer with nothing to score against does not demonstrate the
platform's value — it demonstrates its absence.

The correct pilot structure has two phases:

### Phase 0 — Shadow Operation (4-6 weeks before official pilot start)

Route specs use the app on real routes. Data flows into the canonical layer.
The system is not officially in pilot — it is being validated internally.

Goals of shadow operation:
- Populate `core.visits`, `core.observations`, `core.evidence` with real data
  from real stops on real routes
- Verify the canonical write paths under actual field conditions, not test
  conditions
- Identify any edge cases in offline replay, photo upload, or stop completion
  that only appear under real operational load
- Give the risk map enough history to produce meaningful scores before any
  stakeholder sees it
- Give route specs time to develop muscle memory with the UI before the pilot
  is formally observed

Shadow operation data is real canonical data. It is not backfilled, not
synthetic, not test artifacts. It is the foundation the pilot runs on.

### Phase 1 — Official Pilot (90 days)

The official pilot begins when:
- Tier 1 and Tier 2 are both verified complete
- Shadow operation has run for at least 4 weeks
- The risk map shows meaningful condition scores for the pilot stop pool
- The Control Center is showing real route completion data
- Success criteria are agreed and documented in the pilot SOW

---

## What the Pilot Actually Is

### Scope
- Pool: stops with shelter or trash infrastructure (~2,000 stops in KCM's
  active pool, defined by `has_trash = true OR num_shelters > 0`)
- Users: all active route specialists (~20-40 ULs) + their Leads + Admin access
  for dispatcher and management
- Duration: 90 days from official pilot start date
- Geography: KCM Transit Facilities Division service area

### The Pilot Is the Full KCM Deployment

KCM is not a partial pilot that expands to a larger deployment. The ~2,000
serviceable stops IS the KCM deployment universe. The pilot scope and the
contract scope are the same. This simplifies the conversion conversation:
pilot succeeds → same scope → formalize and extend. No expansion negotiation.

### Success Criteria (defined before pilot starts, not after)

These are criteria BASELINE is designed to pass:

- Route specialists complete stop documentation on the system for 90
  consecutive days without reverting to manual methods
- Zero labor grievances related to data collection during the pilot period
- Dispatcher uses Control Center during every active shift
- Risk map populated with condition scores for all stops in the pilot pool
- `stop_effort_history` and `stop_condition_history` populated with 90 days
  of real visit data
- System uptime above 99% during pilot period
- `SELECT * FROM stop_effort_history` returns no `user_id` column —
  demonstrable live to any evaluator including union representatives

### Pilot Pricing

A flat pilot fee of $15,000-$25,000 covering:
- Setup and onboarding
- Shadow operation support
- 90 days of managed operation with direct founder support
- Close-out report

Upon conversion to a full contract, the pilot fee is credited against year one.

---

## The Full Contract

### Pricing Model

Not per-seat. Not per-stop. Platform fee model.

The serviceable asset universe (stops with shelter or trash infrastructure)
is fixed by asset inventory, not staffing decisions. This makes the pricing
unit stable and independently verifiable by procurement.

**Recommended structure:**
- Base platform fee covering infrastructure, intelligence layer, Control Center,
  field UI, labor safety guarantee, and direct support
- Expandable as additional stops or asset types are added without renegotiation

**Pricing anchor:**
The cleaning program total annual budget (labor, supervision, equipment) is
the right denominator. BASELINE as a fraction of the program it makes
defensible and efficient. Research this figure through internal BA access in
the first 90 days of the analytics role — it is the single most important
pricing input.

**Target:** 5-year contract. Annual fee TBD pending program budget research.
The $350K/year figure is a working hypothesis pending internal budget data.

### What the Contract Covers

- Full canonical state layer for all serviceable stops
- Field UI for all route specialists (unlimited UL accounts)
- Lead route creation and management
- Admin Control Center for dispatchers and management
- Intelligence layer: risk map, stop effort history, condition history
- Azure-hosted infrastructure with managed backups
- Direct founder support — no helpdesk queue
- Labor safety guarantee: structural, demonstrable, permanent

### What the Contract Does Not Cover

- EAMS integration (integration agnostic — agencies connect downstream if
  they choose to)
- Per-worker performance reporting (labor safety constraint — permanent)
- GPS tracking or worker location (labor safety constraint — permanent)

---

## The Vendor Infrastructure Checklist

Items required before a government agency can issue a PO. Do not wait for
the pilot conversation to start these — processing lag is real.

### Do Immediately (before the BA role starts)
- [ ] Register in King County E-Procurement Supplier Portal
- [ ] Register in Washington WEBS (Washington's Electronic Business Solution)
- [ ] Confirm business entity — existing LLC or new one for BASELINE
- [ ] Open dedicated business banking account if not already separate
- [ ] Get a UBI number if not already registered

### Do Within First 30 Days of BA Role
- [ ] Business liability insurance — general + professional/E&O
  ($1-2M coverage, certificate naming King County as additional insured)
- [ ] Draft Master Services Agreement template (one attorney consultation)
- [ ] Draft pilot Statement of Work template
- [ ] Draft rate card / pricing proposal template

### Do Before Pilot Conversation
- [ ] Azure production environment provisioned (App Service + PostgreSQL +
  Blob Storage — replaces local dev stack)
- [ ] Deployment runbook — can stand up new environment in under 48 hours
- [ ] Data backup and retention policy — written, one page
- [ ] Security posture document — written, one page (not SOC 2 — just honest
  documentation of access controls, backup policy, incident response)
- [ ] Support model documented — response time commitments, escalation path
- [ ] Pilot onboarding checklist — what KCM needs to provide for setup

---

## The Multi-Agency Scale Strategy

### The Moat

Three components that compound and are structurally difficult to replicate:

**1. Integration agnostic**
No IT department can kill the procurement with a compatibility objection.
No integration required to get value. Data exports to whatever they need
downstream. Deploy alongside whatever they have.
Rule: never build a native EAMS integration as a core product feature.
Never become an integration project.

**2. True canonical state layer**
Every visit, observation, and evidence artifact attaches to the asset.
Condition history compounds in value every day the system runs.
Switching cost grows with data depth — after 12 months of operation,
an agency's condition history is irreplaceable.
The public API surface (planned, not yet built) is the integration
layer. Agencies build connections to their systems. BASELINE provides
the surface, not the connectors.

**3. Union acceptance — structural, not policy**
Demonstrable by opening a terminal and running three queries.
No competitor can retrofit this onto a work-order model.
The labor safety story travels to every transit authority, parks
department, and public works agency with a unionized cleaning workforce.

### The Distribution Channel

The Deputy Director of KCM Transit Facilities Division has stated
unprompted that the union/data collection problem is a nationwide issue
and that he is personally networked with transit authorities across the
country who all have the same problem.

This is not a sales lead. It is a market validation from a senior
transit executive who did not know he was providing it.

The correct use of this relationship:
- Monthly check-ins remain mentorship, not sales meetings
- The product enters conversation only when he asks, never proactively
- "We're running a pilot at KCM" is the sentence that changes the
  relationship — said naturally when it is true, not pitched
- His introductions to peer agencies happen after KCM is running,
  never before

### The Scale Architecture Requirements

Two tiers must be complete before a second agency onboards:

**Tier 7 — Row Level Security**
DB-layer tenant isolation. No query can leak data across org boundaries
regardless of application logic. Must be in place before any second
agency's data touches the system.

**Tier 8 — Asset Type Abstraction**
`transit_stops` becomes one implementation of a generic asset, not the
platform center. Per-tenant asset type registry. Per-tenant observation
type configuration. A parks department, public housing authority, or
airport ground ops team can be onboarded via CSV asset upload without
code changes.

These are not demo requirements. They are pre-scale requirements.
KCM pilot runs without them. Agency two does not.

### The Onboarding Flow (Post-Tier-8)

1. Org record created, `org_id` assigned
2. Azure Entra tenant ID registered
3. Asset type configured (transit_stop, restroom, trailhead, etc.)
4. Observation types configured for asset type
5. Asset inventory uploaded via CSV through tenant admin API
6. User accounts provisioned with roles
7. Shadow operation begins

No developer required after Tier 8 is complete. This is the test.

### Market Sizing (Working Estimates)

| Segment | Universe | Realistic Capture (5yr) | Est. ARR |
|---------|----------|------------------------|----------|
| Large transit agencies (1,000+ vehicles) | ~50 US agencies | 5-10% | $750K-$1.5M |
| Mid-size transit agencies | ~400 US agencies | 3-5% | $720K-$1.2M |
| Adjacent verticals (parks, public housing, airports) | Large but undefined | Early exploration | TBD |

Realistic 5-year ceiling at modest penetration: **$1.5M-$2.7M ARR**

This is a viable, fundable vertical SaaS with a known customer base,
a networked distribution channel, and no meaningful direct competition.

---

## R5 Architecture Correction

The stop wizard described in `REFINEMENT_R5_ENTERPRISE_UI.md` Surface 3
does not reflect the actual UI architecture. The correct implementation is:

**Single screen with modal-driven gated data collection.**

The worker sees one stop screen. Data collection happens through modals
that gate stage completion — each modal handles one observation stage
(checklist, safety, infra, photo) and must be completed before the next
unlocks. The completion CTA lives on the main screen and is only active
after all gates are cleared.

This is a better pattern than a wizard for field use:
- No page transitions — worker stays oriented
- No back-button confusion
- No lost state between steps
- Faster to complete under time pressure

When `REFINEMENT_R5_ENTERPRISE_UI.md` is updated, Surface 3 must be
rewritten to reflect this architecture. The agent launch block for
Surface 3 must also be updated.

All other R5 surfaces (shell, stop list, lead panel, admin views,
control center) are correct as written.

---

## R7 Historical Backfill — Scope Correction

`REFINEMENT_R7_HISTORICAL_BACKFILL.md` assumes a body of real operational
history in the transit adapter tables predating the canonical layer.

**The actual state:** The current database contains test artifacts only —
rows written during feature development and verification testing. These
are not real operational records and must not be backfilled into the
canonical layer. Doing so would contaminate the risk map and condition
history with synthetic signals.

**Revised R7 scope:**

R7 is deprioritized until after the pilot generates real operational data.
The correct pre-pilot data strategy is the shadow operation period (Phase 0),
which generates real canonical state from real route completions before the
official pilot start.

R7 remains relevant in one future scenario: if a meaningful period of real
operations accumulates in the transit adapter tables before Tier 2 is
verified (e.g., shadow operation runs before Tier 2 completes), the backfill
script can migrate those real records into the canonical layer. That is a
post-shadow-operation decision, not a pre-demo task.

**R7 status: deferred to post-shadow-operation scope.**

---

## Session Principles Addendum

These principles extend the execution principles in PROJECT_CONTEXT.md:

**8. Canonical state is the pilot gate.**
No agency sees a production deployment until Tier 1 and Tier 2 are both
verified complete. There are no exceptions to this. A demo on a dev build
is a demo. A pilot is a production deployment on canonical state.

**9. Shadow operation precedes pilot.**
4-6 weeks of real operational use before the official pilot start date.
The risk map must have meaningful history before any stakeholder evaluates
it. Empty canonical tables on day one of a pilot is a failure mode.

**10. Integration agnostic is a hard constraint, not a preference.**
Never build a native integration as a core product feature. The API surface
is the integration layer. Agencies connect downstream if they choose to.
Every native integration discussion is a veto opportunity and a scope trap.

**11. Tier 7 and Tier 8 gate agency two, not agency one.**
KCM pilot proceeds without multi-tenancy. No second agency onboards without
Row Level Security (Tier 7) and asset type abstraction (Tier 8) complete.

**12. Pricing is anchored to program budget, not per-unit math.**
The cleaning program total annual budget is the correct pricing denominator.
Research this figure through BA role access in the first 90 days.
Do not anchor the contract conversation to per-stop or per-seat math.