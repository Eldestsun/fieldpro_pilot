# Intelligence Layer — Design Questions & Founding Spec

> **Home**: planning/intelligence-layer/ (the future intelligence workstream).
> **Status**: DESIGN DIRECTION. Not a build. Inherited by the intelligence
> workstream when it spins up (after the state layer merges).
> **Companion**: ISSUE-016 in KNOWN_ISSUES (the risk-map numerator question)
> belongs to this same workstream.

---

## 1. The core model: relative, self-improving baseline (not a fixed threshold)

There is no fixed definition of "problem stop." The product is named for the
technique: **the baseline of all stops becomes the Baseline.** Problem stops are
the ones materially out past the median of the whole population's condition.

Why this matters:
- KCM's current "problem stop" notion is downstream of corrective work orders —
  maximal selection bias (only stops that already failed badly enough to generate
  a ticket exist in the data; degrading-but-not-broken stops and fine stops are
  invisible). We are AUTHORING the definition of stop condition for an org that
  has never had one.
- Relative-to-baseline is **self-calibrating and self-improving**: intelligence
  surfaces the tail → effort redistributes to the tail → the tail improves → the
  median shifts → "problem" tightens automatically. A continuous-improvement
  engine that raises its own standard as the network improves. (This is, not by
  accident, Deputy GM Kandilige's stated mandate — continuous improvement.)
- It is **defensible at every altitude because it refers only to itself**: no
  arbitrary threshold to defend ("why level 3 not 2"), no worker measured (only
  stops, against other stops). Labor relations can't object; BAs can't poke holes
  in a threshold that doesn't exist; leadership gets a number meaning "relative to
  our own current standard."

## 2. The layered model (locked)

- The state layer stores the narrow base fact per observation: "was this
  component acceptable?" (binary for almost everything; 0–4 measurement for trash).
- "Problem stop" lives in the INTELLIGENCE layer as distance-from-moving-baseline.
- Capture stays binary by necessity: every additional rating asked of the
  specialist (a) heavies the UX toward feeling like a quality audit and (b)
  crosses from recording service into self-reporting service quality — the
  surveillance blur the whole architecture forbids. So richness comes from
  ACCUMULATION (time turns booleans into rates), never from richer capture.
  The labor-safety constraint didn't cost intelligence; it forced the better
  model (rates-over-time beat subjective severity taps on every axis).

## 3. The intelligence TIERS

**Tier 1 — accumulation substrate.** Per-signal rates and trends over time, per
stop, relative to the moving baseline. Deterministic SQL in MVs. No AI. Small —
it's counting and comparing over the finished state layer. Everything else reads
this.

**Tier 2 — explainable pattern rules.** Context-dependent logic written from
field expertise (see §4). Captures that the meaning of one signal depends on the
others. Still not ML — an expert system, fully inspectable ("here's exactly why
this stop was flagged").

**Tier 3 — learned pattern detection.** Actual ML: clustering stops by behavior
signature, anomaly detection, overflow prediction, finding patterns no one wrote
a rule for. This is the AI roadmap.

### Sequencing decision (founder, 2026-05-25)
- Tier 1 and Tier 2 are NOT temporally sequential — Tier 2 only needs Tier 1's
  substrate to exist, and that substrate is small. Build them close together.
- **LEAD THE DEMO WITH TIER 2**, kept explainable. Rationale: Tier 1 alone is
  already better than work-order data, but Tier 2 ("here's the stop trending
  toward overflow before any work order exists, and here's why") is what makes
  KCM see how blind the work-order model is. Leading with the differentiating
  intelligence is the right call given the selection-bias gap.
- **Keep Tier 2 explainable; reserve the black box for Tier 3 earned later.**
  An AI-averse government buyer will not accept "our black box decides which
  stops are problems" on day one (same anxiety as EAMS-audit). They WILL accept
  inspectable expert-rules written by a former route specialist. By the time
  Tier 3 arrives, it extends a system whose judgment they've already validated by
  hand. The explainable tiers are the trust ladder that makes the AI adoptable.
  Lead with adoptability, deliver power. Pitching ML cold convenes a public-data
  governance committee and costs a year.

## 4. FOUNDING SPEC for Tier 2 pattern rules (from founder field examples)

The structural insight: **risk is not the sum of independent per-signal scores.
Risk is a pattern across signals, and the meaning of any one signal depends on
the others.** A per-signal threshold scores the same trash reading identically
regardless of context — wrong in both directions. This is precisely what a human
analyst can't hold across thousands of stops, and precisely what pattern
detection is for. (This also corrects ISSUE-016's implicit additive framing —
see that issue; recalibrate accordingly.)

Two founding examples (generalize the pattern logic across ALL observation types):

**Example A — trash IS the story (frequency problem).**
A stop requires few cleaning tasks over a month, but trash is high on 3 of 4
visits, other signals quiet. → This is a SERVICE-FREQUENCY signal: once/week is
risky; recommend twice/week to offset overflow risk. Finer: if the high readings
cluster on a specific weekday while a different weekday stays low, intelligence
should surface "add one well-timed visit" rather than a blanket frequency bump.
The intelligence finds the timing pattern, not just the average.

**Example B — trash is noise (suppress it).**
A stop's trash is little-to-none for a month then one spike, BUT the stop has
chronic graffiti, frequent biohazards, and public dumping. → Here trash severity
has NO bearing on the stop's risk; the risk is driven entirely by other signals.
Intelligence must SUPPRESS the trash signal from this stop's risk picture rather
than let a lone spike inflate it.

Generalized rule shape for Tier 2:
- A signal that is the dominant elevation against quiet others → it IS the story;
  surface its specific remedy (often frequency/timing).
- A signal that spikes against a backdrop of chronic OTHER signals → likely noise
  relative to the real problem; suppress or down-weight it.
- The same raw reading yields opposite conclusions depending on the pattern of
  co-occurring signals. Encode the context-dependence; do not score signals in
  isolation.

## 5. Open questions for the workstream
- ISSUE-016: risk-map numerator (count-of-problems vs count-of-problem-visits)
  and the LEAST(…,5) cap recalibration — decide here, with the §4 pattern model
  in mind.
- Operational / executive / stewardship layer structure (mapped early in
  planning) is the organizational axis this intelligence surfaces into.
- Where Kandilige reads from (executive brief built on stewardship evidence) —
  resolved in principle; confirm against final org understanding.
