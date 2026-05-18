/**
 * oidCipher.ts — Application-layer AES-256-GCM envelope encryption for
 * core.visits.actor_oid (stored in captured_by_oid_ciphertext / _key_id).
 *
 * WHY ENVELOPE ENCRYPTION:
 * A per-record DEK (data encryption key) is generated for each OID. The DEK
 * is wrapped (encrypted) by a KEK (key encryption key) held in the KMS. This
 * means:
 *  - Rotating the KEK does not require re-encrypting every OID — only the
 *    wrapped DEKs need re-wrapping.
 *  - The KMS never sees plaintext OID data, only DEK wrap/unwrap operations.
 *
 * BLOB LAYOUT  (captured_by_oid_ciphertext, stored as PostgreSQL BYTEA):
 *
 *   Offset   Size  Field
 *   ──────   ────  ─────────────────────────────────────────────────────────
 *   0        1     version  (uint8, currently = 1)
 *   1-2      2     wrapped_dek_len  (uint16 big-endian, N)
 *   3..N+2   N     wrapped_dek
 *                  DevStaticKeyAdapter:
 *                    wrap_iv(12) ‖ aes256gcm_ciphertext_of_dek(32) ‖ tag(16)
 *                    = 60 bytes total
 *                  AzureKeyVaultAdapter:
 *                    raw result of CryptographyClient.wrapKey()
 *                    (RSA-OAEP-256, typically 256 bytes)
 *   N+3      12    data_iv   — AES-256-GCM IV for OID encryption with DEK
 *   N+15     16    data_tag  — GCM authentication tag
 *   N+31     var   data_ciphertext — encrypted OID (same byte length as
 *                  plaintext OID string in UTF-8)
 *
 * ADAPTER SELECTION:
 *   NODE_ENV !== 'production' → DevStaticKeyAdapter
 *     Requires DEV_OID_KEY env var: 32-byte hex (64 hex chars).
 *     Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   NODE_ENV === 'production'  → AzureKeyVaultAdapter  ← STUB (see below)
 *     Requires AZURE_KEY_VAULT_URL + AZURE_KEY_VAULT_KEY_NAME.
 *     Install @azure/keyvault-keys + @azure/identity before enabling.
 *
 * HOSTING NOTE (S3-1):
 *   Azure commercial for pilot — same SDK, different vault URL.
 *   Azure Government for full contract — same SDK, .us domain vault URL.
 */

import "dotenv/config";
import crypto from "crypto";
import { writeAuditLog } from "../middleware/auditLog";

const BLOB_VERSION = 1;
const DEK_LEN      = 32;   // 256-bit DEK
const IV_LEN       = 12;   // 96-bit AES-GCM IV (NIST recommended)
const TAG_LEN      = 16;   // 128-bit GCM auth tag

/**
 * Minimal request shape required by decrypt() for audit logging.
 * Intentionally loose so callers don't need to import the full Express type.
 */
export type AuthedRequest = {
  user?: { oid?: string; tid?: string; [k: string]: unknown };
};

// ── Adapter interface ────────────────────────────────────────────────────────

/**
 * KMS adapter contract. Implementations wrap and unwrap the per-record DEK
 * using the KMS-held KEK. The adapter is never given plaintext OID data.
 */
export interface OidCipherAdapter {
  /**
   * Wrap (encrypt) a DEK using the KMS KEK.
   * Returns the opaque wrapped bytes and the key version identifier.
   */
  wrapDek(dek: Buffer): Promise<{ wrappedDek: Buffer; keyId: string }>;

  /**
   * Unwrap (decrypt) a wrapped DEK using the KMS key identified by keyId.
   * Throws if keyId is unknown or auth tag verification fails.
   */
  unwrapDek(wrappedDek: Buffer, keyId: string): Promise<Buffer>;
}

// ── DevStaticKeyAdapter ──────────────────────────────────────────────────────

/**
 * Development-only adapter. Uses a static 32-byte AES-256 KEK loaded from
 * the DEV_OID_KEY environment variable (64 hex chars).
 *
 * NOT safe for production. Worker OIDs encrypted with this adapter can be
 * decrypted by anyone who has the env var. The production path requires the
 * Azure Key Vault adapter below.
 */
export class DevStaticKeyAdapter implements OidCipherAdapter {
  private readonly kek: Buffer;

  constructor() {
    const hexKey = process.env.DEV_OID_KEY;
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        "DEV_OID_KEY must be a 32-byte hex string (64 hex chars). " +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    this.kek = Buffer.from(hexKey, "hex");
  }

  async wrapDek(dek: Buffer): Promise<{ wrappedDek: Buffer; keyId: string }> {
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.kek, iv);
    const encDek = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Layout: wrap_iv(12) ‖ enc_dek(32) ‖ wrap_tag(16) = 60 bytes
    const wrappedDek = Buffer.concat([iv, encDek, tag]);
    return { wrappedDek, keyId: "dev-static-v1" };
  }

  async unwrapDek(wrappedDek: Buffer, keyId: string): Promise<Buffer> {
    if (keyId !== "dev-static-v1") {
      throw new Error(`DevStaticKeyAdapter: unknown keyId "${keyId}"`);
    }
    const expected = IV_LEN + DEK_LEN + TAG_LEN; // 60 bytes
    if (wrappedDek.length !== expected) {
      throw new Error(
        `DevStaticKeyAdapter: malformed wrappedDek — expected ${expected} bytes, got ${wrappedDek.length}`,
      );
    }
    const iv      = wrappedDek.subarray(0, IV_LEN);
    const encDek  = wrappedDek.subarray(IV_LEN, IV_LEN + DEK_LEN);
    const tag     = wrappedDek.subarray(IV_LEN + DEK_LEN);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.kek, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encDek), decipher.final()]);
  }
}

// ── AzureKeyVaultAdapter (stub) ──────────────────────────────────────────────

/**
 * Production KMS adapter — Azure Key Vault.
 *
 * TODO (S3-1 — hosting decision):
 *   1. pnpm add @azure/keyvault-keys @azure/identity
 *   2. Set env vars: AZURE_KEY_VAULT_URL, AZURE_KEY_VAULT_KEY_NAME
 *   3. Replace stub methods with real SDK calls:
 *
 *      import { CryptographyClient, KeyClient } from '@azure/keyvault-keys';
 *      import { DefaultAzureCredential } from '@azure/identity';
 *
 *      constructor() {
 *        const vaultUrl  = process.env.AZURE_KEY_VAULT_URL!;
 *        const keyName   = process.env.AZURE_KEY_VAULT_KEY_NAME!;
 *        const cred      = new DefaultAzureCredential();
 *        const keyClient = new KeyClient(vaultUrl, cred);
 *        // Resolve the latest key version once at startup:
 *        this.cryptoClient = new CryptographyClient(
 *          `${vaultUrl}/keys/${keyName}`,
 *          cred,
 *        );
 *      }
 *
 *      async wrapDek(dek: Buffer) {
 *        const result = await this.cryptoClient.wrapKey('RSA-OAEP-256', dek);
 *        return { wrappedDek: Buffer.from(result.result), keyId: result.keyID! };
 *      }
 *
 *      async unwrapDek(wrappedDek: Buffer, keyId: string) {
 *        const cryptoClientForVersion = new CryptographyClient(keyId, cred);
 *        const result = await cryptoClientForVersion.unwrapKey('RSA-OAEP-256', wrappedDek);
 *        return Buffer.from(result.result);
 *      }
 *
 * Hosting note:
 *   Azure commercial (pilot) → AZURE_KEY_VAULT_URL=https://<vault>.vault.azure.net
 *   Azure Government (full)  → AZURE_KEY_VAULT_URL=https://<vault>.vault.usgovcloudapi.net
 *   Both use the same SDK — only the URL differs. No code changes required
 *   when migrating between environments.
 */
export class AzureKeyVaultAdapter implements OidCipherAdapter {
  async wrapDek(_dek: Buffer): Promise<{ wrappedDek: Buffer; keyId: string }> {
    throw new Error(
      "AzureKeyVaultAdapter: not implemented. " +
        "Install @azure/keyvault-keys + @azure/identity and implement per S3-1 spec. " +
        "Set AZURE_KEY_VAULT_URL and AZURE_KEY_VAULT_KEY_NAME.",
    );
  }

  async unwrapDek(_wrappedDek: Buffer, _keyId: string): Promise<Buffer> {
    throw new Error(
      "AzureKeyVaultAdapter: not implemented. " +
        "Install @azure/keyvault-keys + @azure/identity and implement per S3-1 spec. " +
        "Set AZURE_KEY_VAULT_URL and AZURE_KEY_VAULT_KEY_NAME.",
    );
  }
}

// ── Adapter selection ────────────────────────────────────────────────────────

function makeAdapter(): OidCipherAdapter {
  if (process.env.NODE_ENV === "production") {
    return new AzureKeyVaultAdapter();
  }
  return new DevStaticKeyAdapter();
}

let _adapter: OidCipherAdapter | null = null;

function getAdapter(): OidCipherAdapter {
  if (!_adapter) _adapter = makeAdapter();
  return _adapter;
}

/** Override the active adapter — for tests only. */
export function _setAdapterForTest(adapter: OidCipherAdapter): void {
  _adapter = adapter;
}

// ── Blob pack / unpack ───────────────────────────────────────────────────────

function packBlob(
  wrappedDek: Buffer,
  dataIv: Buffer,
  dataTag: Buffer,
  dataCiphertext: Buffer,
): Buffer {
  const header = Buffer.allocUnsafe(3);
  header.writeUInt8(BLOB_VERSION, 0);
  header.writeUInt16BE(wrappedDek.length, 1);
  return Buffer.concat([header, wrappedDek, dataIv, dataTag, dataCiphertext]);
}

function unpackBlob(blob: Buffer): {
  version: number;
  wrappedDek: Buffer;
  dataIv: Buffer;
  dataTag: Buffer;
  dataCiphertext: Buffer;
} {
  if (blob.length < 3) {
    throw new Error("oidCipher: blob too short to contain header");
  }
  const version = blob.readUInt8(0);
  const wdLen   = blob.readUInt16BE(1);
  const base    = 3;

  if (blob.length < base + wdLen + IV_LEN + TAG_LEN + 1) {
    throw new Error(
      `oidCipher: blob truncated — expected at least ${base + wdLen + IV_LEN + TAG_LEN + 1} bytes, got ${blob.length}`,
    );
  }

  const wrappedDek     = blob.subarray(base, base + wdLen);
  const dataIv         = blob.subarray(base + wdLen, base + wdLen + IV_LEN);
  const dataTag        = blob.subarray(base + wdLen + IV_LEN, base + wdLen + IV_LEN + TAG_LEN);
  const dataCiphertext = blob.subarray(base + wdLen + IV_LEN + TAG_LEN);

  return { version, wrappedDek, dataIv, dataTag, dataCiphertext };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypt an OID string using envelope encryption.
 *
 * @param plaintext - the Azure Entra OID to encrypt (e.g. actor_oid)
 * @param reason    - documented reason for this encryption (for audit paper trail;
 *                    stored in the decrypt audit entry when the OID is later read)
 * @returns ciphertext blob (BYTEA) and keyId (stored in captured_by_oid_key_id)
 */
export async function encrypt(
  plaintext: string,
  reason: string,
): Promise<{ ciphertext: Buffer; keyId: string }> {
  void reason; // reason is reserved for the decrypt audit trail, not stored in the blob
  const adapter = getAdapter();

  // 1. Generate a fresh per-record DEK.
  const dek = crypto.randomBytes(DEK_LEN);

  // 2. Wrap the DEK with the KMS KEK.
  const { wrappedDek, keyId } = await adapter.wrapDek(dek);

  // 3. Encrypt the OID with the DEK.
  const dataIv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, dataIv);
  const dataCiphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const dataTag = cipher.getAuthTag();

  // 4. Pack into a single BYTEA blob.
  const ciphertext = packBlob(wrappedDek, dataIv, dataTag, dataCiphertext);
  return { ciphertext, keyId };
}

/**
 * Decrypt a captured_by_oid_ciphertext blob back to the plaintext OID.
 *
 * ALWAYS writes an admin.oid_decrypt audit log entry — every call leaves
 * a trail. This converts any bad-actor key-release request from an invisible
 * operation into a documented, timestamped, actor-attributed event.
 *
 * @param ciphertext - BYTEA blob from core.visits.captured_by_oid_ciphertext
 * @param keyId      - from core.visits.captured_by_oid_key_id
 * @param reason     - required justification; written verbatim to audit log detail
 * @param req        - authenticated HTTP request (supplies actor_oid + org_id for audit)
 * @param visitId    - optional: core.visits.id being decrypted (written to resource_id)
 */
export async function decrypt(
  ciphertext: Buffer,
  keyId: string,
  reason: string,
  req: AuthedRequest,
  visitId?: string | number,
): Promise<string> {
  const adapter = getAdapter();
  const { wrappedDek, dataIv, dataTag, dataCiphertext } = unpackBlob(ciphertext);

  // 1. Unwrap DEK from KMS.
  const dek = await adapter.unwrapDek(wrappedDek, keyId);

  // 2. Decrypt OID with DEK.
  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, dataIv);
  decipher.setAuthTag(dataTag);
  const plaintext = Buffer.concat([
    decipher.update(dataCiphertext),
    decipher.final(),
  ]).toString("utf8");

  // 3. Mandatory audit trail — fires after successful decryption.
  const actorOid = (req.user as any)?.oid ?? "unknown";
  // Resolve numeric org_id; writeAuditLog also converts UUID strings internally as fallback.
  const orgId = (req.user as any)?.tid ?? process.env.AZURE_TENANT_ID ?? "unknown";
  try {
    await writeAuditLog({
      actor_oid:     actorOid,
      org_id:        orgId,
      action:        "admin.oid_decrypt",
      resource_type: "visit",
      resource_id:   visitId != null ? String(visitId) : undefined,
      detail:        { reason },
    });
  } catch (auditErr) {
    // Audit failure is logged but does not suppress the plaintext.
    // The plaintext has already been decrypted; silently dropping it
    // would be worse than returning it without the audit entry.
    console.error("[oidCipher] audit write failed on decrypt:", auditErr);
  }

  return plaintext;
}
