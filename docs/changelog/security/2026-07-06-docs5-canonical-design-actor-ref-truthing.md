# 2026-07-06 — DOCS-5: truth CANONICAL_STATE_LAYER_DESIGN §3.2 — the actor_ref "opaque" misnomer

**Branch:** `docs/docs-5-canonical-design-truthing`
**Type:** Documentation — deliberate truthing of the origin document behind CASE-1
**Scope:** `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` §3.2 only. No code, no schema
(the live sidecars already carry the cipher columns).

## Why

§3.2's illustrative DDL commented `actor_ref` as *"opaque external identity (e.g. Entra
OID)."* That misnomer was the origin of the CASE-1 finding (ISSUE-058): the forensic proved
`actor_ref` held the **raw Entra OID in plaintext**, byte-identical to the JWT claim and
resolvable to a name via a keyless join — "opaque" hid a plaintext-at-rest leak for months.
This is the document the whole ISSUE-058 arc traces back to, so it should tell the truth.

## Discovery — a third state, not simply "pre-cipher"

The doc was neither fully stale nor already correct:
- The **illustrative DDL** (pre-2026-05-30) showed only `actor_ref` and called it "opaque
  external identity" — the misnomer.
- A **2026-06-01 NOTE block** already partially truthed it (named the cipher columns, called
  the DDL illustrative, pointed to the migrations as authoritative) — **but that note was
  itself now stale**: it said the cipher columns were *"populated only on `visit_actor_audit`
  today,"* which ISSUE-058 Phase 1 (merged) closed by fixing all four sidecar write paths.
- The **sentinel fact** (`actor_ref = 'encrypted'`, never identity) was absent from the whole
  document.

Live `\d core.visit_actor_audit` (ground truth the correction targets): `actor_ref text`,
`actor_ref_ciphertext bytea`, `actor_ref_key_id text`, bigint keys.

## What changed

- **Illustrative DDL:** the `actor_ref` comment now states it holds a fixed non-identifying
  sentinel `'encrypted'`, never the OID; added the `actor_ref_ciphertext` / `actor_ref_key_id`
  columns (with a comment that the real OID lives there, S1-13 envelope, recoverable only via
  the audited `decrypt()` path).
- **2026-06-01 NOTE block:** updated the stale *"populated only on `visit_actor_audit`"* bullet
  to reflect that ISSUE-058 Phase 1 writes the sentinel + ciphertext at all four write paths;
  pre-Phase-1 historical rows may still carry plaintext until the Phase-2 backfill (gated on
  the Azure Key Vault custodian).
- **Dated correction note** (2026-07-06 truthing, ref ISSUE-058 / CASE-1) added under the DDL,
  matching the DOCS-4 (aeccf91) pattern — so the change reads as deliberate truthing, quoting
  the old false wording and stating the fix.

## What was deliberately NOT changed

- The other `opaque` occurrence in the doc (§8a, *"intelligence verifiable rather than
  opaque"*) is a correct, unrelated usage about analytical transparency — left untouched.
- §9 item 6 describes the sidecar **grant boundary**, not `actor_ref` column semantics — no
  cross-section contradiction, nothing to reconcile there.
- `visit_id uuid` in the illustrative DDL (live is bigint) — already addressed by the existing
  NOTE block; out of this correction's scope.

## Proof

- **grep** for identity-carrying descriptions of `actor_ref`: the only remaining
  "opaque"/"external identity"/"Entra OID" mentions are inside the dated correction note that
  **quotes the old wording on purpose**. No live-facing description calls `actor_ref`
  identity-carrying. The unrelated §8a "opaque" is preserved.

## Files touched

- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`
