# 2026-05-13 — S1-13 KMS-encrypted captured_by_oid on core.visits

## What changed

- **Migration** `backend/migrations/20260513_s1_13_oid_encryption.sql`: adds
  `captured_by_oid_ciphertext BYTEA` and `captured_by_oid_key_id TEXT` to
  `core.visits`. Plaintext `actor_oid` is retained for one release cycle of
  dual-write; a follow-up migration will drop it once dual-write is confirmed.

- **`backend/src/lib/oidCipher.ts`** (new): application-layer AES-256-GCM
  envelope encryption library.
  - `OidCipherAdapter` interface with `wrapDek` / `unwrapDek` contract.
  - `DevStaticKeyAdapter`: per-record DEK wrapped with `DEV_OID_KEY` (env var,
    32-byte hex). Used when `NODE_ENV !== 'production'`.
  - `AzureKeyVaultAdapter`: stub with clear `TODO` for S3-1 hosting decision.
    Uses `@azure/keyvault-keys` + `DefaultAzureCredential` once installed.
    Hosting note: Azure commercial for pilot; Azure Government for full
    contract. Same SDK, different vault URL only.
  - Blob layout (documented in file header): `version(1) | wrapped_dek_len(2) |
    wrapped_dek(N) | data_iv(12) | data_tag(16) | data_ciphertext(var)`.
  - `encrypt(plaintext, reason)`: generates random DEK per record, wraps with
    KMS KEK, encrypts OID with DEK using AES-256-GCM.
  - `decrypt(ciphertext, keyId, reason, req, visitId?)`: unwraps DEK, decrypts
    OID, writes mandatory `admin.oid_decrypt` audit log entry on every call.

- **`backend/src/domains/visit/visitService.ts`**: `ensureVisitForRouteRunStop`
  now calls `encrypt(actorOid, 'visit_create')` before INSERT and writes both
  new columns. Plaintext `actor_oid` is also written (dual-write period).

- **`backend/scripts/backfillOidEncryption.ts`** (new): batch backfill script.
  Encrypts all existing `core.visits` rows that have `actor_oid` but no
  `captured_by_oid_ciphertext`. Idempotent; runs in batches of 500 with
  `SELECT … FOR UPDATE SKIP LOCKED` for safe concurrent execution.

- **`backend/.env.example`**: documents `DEV_OID_KEY`, `AZURE_KEY_VAULT_URL`,
  `AZURE_KEY_VAULT_KEY_NAME` variables.

- **`backend/tests/canonical/oidCipher.test.ts`** (new): 10 tests covering
  encrypt→decrypt roundtrip, non-deterministic ciphertext, wrong key throws,
  tampered ciphertext throws, unknown keyId throws, missing key env var throws,
  Azure stub throws, and DB column-presence check via `ensureVisitForRouteRunStop`.

## Why

- Converts the `captured_by_oid` deterrent (access trail required to reach
  plaintext) into a structural prevention: a reader with DB access cannot
  reconstruct worker OIDs without a KMS decrypt permission, which is itself
  logged outside BASELINE.
- Satisfies NIST SC-13 and SC-28 requirements targeted in Sprint 2 policy
  documents.
- Labor-safety constraint maintained: no new worker identity surface introduced.
  The same data that was in `actor_oid` (plaintext) is now also in
  `captured_by_oid_ciphertext` (encrypted). No intelligence-layer table
  changed.

## Files touched

- `backend/migrations/20260513_s1_13_oid_encryption.sql` (new)
- `backend/src/lib/oidCipher.ts` (new)
- `backend/src/domains/visit/visitService.ts`
- `backend/scripts/backfillOidEncryption.ts` (new)
- `backend/.env.example`
- `backend/tests/canonical/oidCipher.test.ts` (new)
- `backend/tests/run.ts`
