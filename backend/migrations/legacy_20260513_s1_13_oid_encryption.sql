-- =============================================================
-- S1-13 — KMS-encrypted OID on core.visits
--
-- Adds captured_by_oid_ciphertext (BYTEA) and
-- captured_by_oid_key_id (TEXT) for application-layer
-- AES-256-GCM envelope encryption of the field-worker OID.
--
-- DUAL-WRITE PERIOD:
-- actor_oid (plaintext) remains in place. New inserts write
-- both columns; existing rows are backfilled by the script
-- backend/scripts/backfillOidEncryption.ts.
-- Drop actor_oid in a follow-up migration after one release
-- cycle of confirmed dual-write.
--
-- BLOB LAYOUT (captured_by_oid_ciphertext):
--   Offset   Size  Field
--   0        1     version (uint8 = 1)
--   1-2      2     wrapped_dek_len (uint16 big-endian, N)
--   3..N+2   N     wrapped_dek
--                  DevStaticKeyAdapter: wrap_iv(12)|enc_dek(32)|tag(16) = 60 bytes
--                  AzureKeyVaultAdapter: raw wrapKey() result (varies)
--   N+3      12    data_iv   (AES-256-GCM IV for OID encryption)
--   N+15     16    data_tag  (GCM auth tag)
--   N+31     var   data_ciphertext (encrypted OID, same byte length as plaintext)
--
-- REQUIRED AFTER THIS MIGRATION:
--   pnpm ts-node scripts/backfillOidEncryption.ts
-- This encrypts all existing actor_oid values into the new columns.
-- New inserts via visitService.ts write all three columns automatically.
-- =============================================================

ALTER TABLE core.visits
  ADD COLUMN IF NOT EXISTS captured_by_oid_ciphertext BYTEA,
  ADD COLUMN IF NOT EXISTS captured_by_oid_key_id     TEXT;

COMMENT ON COLUMN core.visits.captured_by_oid_ciphertext IS
  'AES-256-GCM envelope-encrypted actor OID. '
  'Blob layout: version(1) | wrapped_dek_len(2) | wrapped_dek(N) | '
  'data_iv(12) | data_tag(16) | data_ciphertext(var). '
  'See backend/src/lib/oidCipher.ts for full spec.';

COMMENT ON COLUMN core.visits.captured_by_oid_key_id IS
  'KMS key version used to wrap the DEK in captured_by_oid_ciphertext. '
  'Dev: dev-static-v1. Prod: Azure Key Vault key version string.';
