# OK-rule decision — trash_volume

> **Home**: state-layer ok-rule definitions (the per-type acceptable-condition rules).
> **Status**: DECIDED. Safe to encode into the registry ok_rule when ok-rules are set.
> **Decided**: 2026-05-25, in planning conversation, by founder (former route specialist).

## The type

`trash_volume` — kind=measurement, 0–4 scale. The one measurement type; every
other condition type is binary (state) or boolean (presence).

## The decision

Two things are true at once, and the design must hold BOTH:

1. **Level 4 = overflow = absolute `not_ok`, baseline-independent.**
   Rationale: overflow is a definitional service failure, not a relative
   judgment. The can is full and spilling onto the ground — customers can't
   throw trash away while waiting for the bus, and are forced to stand in a
   littered space. This is sub-standard by any public-facing measure regardless
   of what the rest of the network looks like. So 4 trips a hard `not_ok` flag.
   This is the ONE absolute backstop on any type.

2. **Levels 0–3 still flow through as a continuous severity signal over time.**
   The backstop at 4 does NOT replace the measurement. The full 0–4 value is
   recorded and accumulated every visit. Level 4 additionally trips the absolute
   flag. Both at once: a continuous measurement with one hard ceiling.

## Why the measurement must NOT be collapsed to a boolean

This is the critical implementation note for whoever builds the intelligence MVs:

- Every other type yields, over time, a FREQUENCY signal (how often is this
  component not_ok).
- `trash_volume` yields, over time, frequency AND AMPLITUDE (how often AND how
  severely). A stop that hits level 4 twice a month is a different problem than
  one sitting steadily at level 2, even if both "exceed baseline" at the same
  frequency.
- If a future MV flattens trash to "over threshold y/n," the amplitude signal is
  destroyed — and the amplitude signal IS the overflow-prevention intelligence
  from the original intelligence-layer brief. **Do not collapse trash_volume to a
  boolean threshold.** Carry both the frequency-of-elevation and the
  amplitude-over-time.

## Relationship to the relative-baseline model

Aside from the level-4 backstop, "problem-ness" of trash is NOT a fixed threshold.
It is relative to the moving network baseline (see the relative-baseline note in
the intelligence-layer design questions). The ok-rule's job here is narrow:
record the value; flag 4 as absolute not_ok. Everything else — is THIS stop's
fill-rate out past the network median — is an intelligence-layer judgment, not an
ok-rule. Consistent with the layered model: state stores facts, intelligence
computes judgments.

## Capture invariant note (verify, do not assume)

The capture UI shows TRASH VOLUME with a required marker (red asterisk in the
screenshot). If trash volume is genuinely required-to-complete-a-stop, then it is
present on 100% of completed visits — making it the one signal with no silence
problem, and the densest, most reliable input to the accumulation curve. Confirm
required-status against the live completion validation before relying on it as an
always-present anchor measurement.
