# ISSUE-045 — OID-at-rest cipher: fail-closed boot in production

**Date:** 2026-06-27
**Type:** Security hardening
**Issue:** ISSUE-045 (audit Blocker 3 / Punch A5 / Domain 3 — At-rest encryption)
**Branch:** `security/issue-045-cipher-fail-closed-boot`
**Close taken:** Option 2 (fail-closed boot). Option 1 (implement the real Azure Key Vault DEK wrap/unwrap) is intentionally **NOT** taken here — it is Azure-gated and waits on Azure standup.

## Problem

In `NODE_ENV=production` the OID envelope cipher selects `AzureKeyVaultAdapter`, whose `wrapDek`/`unwrapDek` are a stub that throws `"not implemented"` (`backend/src/lib/oidCipher.ts:181-195`). The process booted normally regardless, so encrypted-identity-at-rest was **silently non-functional** in production: the failure only surfaced at the first identity write, deep inside a request. Worker-OID at-rest encryption must never be silently off.

## Change

Added a boot-time fail-closed guard and wired it into the server entrypoint.

- `backend/src/lib/oidCipher.ts` — new exported `assertCipherOperational()` (after `_setAdapterForTest`, lines ~219-268). In `NODE_ENV !== 'production'` it is a no-op. In production it round-trips a throwaway random DEK through the **configured** adapter's `wrapDek → unwrapDek` and verifies recovery; if anything throws or the round-trip mismatches, it throws a descriptive error naming the adapter and the remediation (implement Azure KV wrap/unwrap; set `AZURE_KEY_VAULT_URL` + `AZURE_KEY_VAULT_KEY_NAME`). It calls the **low-level adapter methods directly**, never `encrypt()`/`decrypt()`, so it touches no OID, no DB, and never triggers the mandatory `admin.oid_decrypt` audit path.
- `backend/src/index.ts` — boot now `await`s `assertCipherOperational()` inside an async `start()`; on failure it logs `[FATAL] <message>` to stderr and `process.exit(1)` **before** `app.listen`, so the server never comes up. Success path and dev/test boot are unchanged.

## Why a round-trip probe (not a `instanceof stub` check)

The probe checks that the adapter *actually works*, not merely that it is "the known stub." That makes it forward-correct: a future half-built Azure adapter that wraps but cannot unwrap also fails the gate. It needs no live Azure today because the current stub throws synchronously — which is exactly the fail-closed condition. (Once the real Azure adapter lands, this probe will require KMS reachability at boot, which is the desired fail-closed posture.)

## Scope guardrails honored

- Azure Key Vault adapter **left as the throwing stub** — not implemented here.
- Decrypt path and its mandatory `admin.oid_decrypt` audit block (`oidCipher.ts`, the `writeAuditLog({ action: "admin.oid_decrypt" })` call) are **untouched** — git diff shows zero changes to `decrypt()`; the block shifted line numbers (was 337-344, now ~387-394) purely because additive code sits above it.
- Non-production behavior unchanged — boot check is a no-op outside production.

## Proof

1. **Boot-check diff** — additive only: new `assertCipherOperational()` in `oidCipher.ts` + async `start()` wrapper in `index.ts`. `tsc --noEmit` exits 0.
2. **Prod boot, non-functional adapter** — `NODE_ENV=production … npx ts-node src/index.ts` →
   `[FATAL] OID-at-rest cipher is non-functional in production (AzureKeyVaultAdapter): AzureKeyVaultAdapter: not implemented. …` , **exit code 1**, no listen.
3. **Dev boot** — `npx ts-node src/index.ts` (NODE_ENV unset) → `API listening on http://localhost:4098`, process stays up. Boot check no-op confirmed.
4. **Audit path untouched** — `grep` confirms the `admin.oid_decrypt` / `writeAuditLog` block in `decrypt()` is unchanged; the diff makes no edits to that function.
5. **This changelog entry.**

## Follow-on (not in scope)

Option 1 — the real Azure Key Vault DEK wrap/unwrap — remains open under ISSUE-045's Azure-gated branch (S3-1). When implemented, this same boot guard becomes the live KMS-reachability check at startup.
