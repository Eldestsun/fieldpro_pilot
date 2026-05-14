import crypto from "crypto";
import { test, assert, assertEqual } from "../setup";
import {
  encrypt,
  decrypt,
  DevStaticKeyAdapter,
  AzureKeyVaultAdapter,
  _setAdapterForTest,
  type OidCipherAdapter,
} from "../../src/lib/oidCipher";

// ── Fixture helpers ────────────────────────────────────────────────────────

/** A minimal AuthedRequest stub for decrypt() audit calls. */
function makeReq(oid = "test-oid-cipher-suite", tid = "00000000-0000-0000-0000-000000000099") {
  return { user: { oid, tid } };
}

/** Install a fresh DevStaticKeyAdapter with a random key, then restore after test. */
function withFreshDevAdapter(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const key = crypto.randomBytes(32).toString("hex");
    const prevKey = process.env.DEV_OID_KEY;
    process.env.DEV_OID_KEY = key;
    _setAdapterForTest(new DevStaticKeyAdapter());
    try {
      await fn();
    } finally {
      if (prevKey === undefined) delete process.env.DEV_OID_KEY;
      else process.env.DEV_OID_KEY = prevKey;
      _setAdapterForTest(new DevStaticKeyAdapter()); // re-initialise from restored env
    }
  };
}

// ── Roundtrip ──────────────────────────────────────────────────────────────

test(
  "oidCipher: encrypt→decrypt roundtrip recovers exact plaintext",
  withFreshDevAdapter(async () => {
    const oid = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";
    const { ciphertext, keyId } = await encrypt(oid, "test");

    assert(Buffer.isBuffer(ciphertext), "ciphertext is a Buffer");
    assert(ciphertext.length > 0, "ciphertext is non-empty");
    assertEqual(keyId, "dev-static-v1", "dev keyId");

    const plaintext = await decrypt(ciphertext, keyId, "test roundtrip", makeReq());
    assertEqual(plaintext, oid, "recovered OID matches original");
  }),
);

test(
  "oidCipher: two encryptions of the same OID produce different ciphertexts",
  withFreshDevAdapter(async () => {
    const oid = "same-oid-encrypted-twice";
    const { ciphertext: ct1 } = await encrypt(oid, "test");
    const { ciphertext: ct2 } = await encrypt(oid, "test");
    assert(!ct1.equals(ct2), "ciphertexts differ due to fresh random IV + DEK");
  }),
);

test(
  "oidCipher: roundtrip works with Unicode OID characters",
  withFreshDevAdapter(async () => {
    const oid = "unicode-🔑-test";
    const { ciphertext, keyId } = await encrypt(oid, "test");
    const result = await decrypt(ciphertext, keyId, "unicode test", makeReq());
    assertEqual(result, oid, "unicode roundtrip");
  }),
);

// ── Missing key ────────────────────────────────────────────────────────────

test("oidCipher: DevStaticKeyAdapter constructor throws when DEV_OID_KEY is missing", () => {
  const saved = process.env.DEV_OID_KEY;
  delete process.env.DEV_OID_KEY;
  let threw = false;
  try {
    new DevStaticKeyAdapter();
  } catch (err: any) {
    threw = true;
    assert(
      err.message.includes("DEV_OID_KEY"),
      `expected error message to mention DEV_OID_KEY, got: ${err.message}`,
    );
  } finally {
    if (saved !== undefined) process.env.DEV_OID_KEY = saved;
  }
  assert(threw, "DevStaticKeyAdapter must throw when DEV_OID_KEY is absent");
});

test("oidCipher: DevStaticKeyAdapter constructor throws when DEV_OID_KEY is wrong length", () => {
  const saved = process.env.DEV_OID_KEY;
  process.env.DEV_OID_KEY = "tooshort";
  let threw = false;
  try {
    new DevStaticKeyAdapter();
  } catch (err: any) {
    threw = true;
    assert(
      err.message.includes("DEV_OID_KEY"),
      `expected DEV_OID_KEY mention, got: ${err.message}`,
    );
  } finally {
    if (saved !== undefined) process.env.DEV_OID_KEY = saved;
    else delete process.env.DEV_OID_KEY;
  }
  assert(threw, "DevStaticKeyAdapter must throw on short key");
});

// ── Wrong key ──────────────────────────────────────────────────────────────

test(
  "oidCipher: decrypt throws when ciphertext was encrypted with a different key",
  async () => {
    // Encrypt with key A
    const keyA = crypto.randomBytes(32).toString("hex");
    process.env.DEV_OID_KEY = keyA;
    _setAdapterForTest(new DevStaticKeyAdapter());
    const { ciphertext, keyId } = await encrypt("victim-oid", "test");

    // Attempt decrypt with key B
    const keyB = crypto.randomBytes(32).toString("hex");
    process.env.DEV_OID_KEY = keyB;
    _setAdapterForTest(new DevStaticKeyAdapter());

    let threw = false;
    try {
      await decrypt(ciphertext, keyId, "wrong key", makeReq());
    } catch {
      threw = true;
    }
    assert(threw, "decrypt must throw when the KEK does not match the encryption key");

    // Restore adapter from env
    _setAdapterForTest(new DevStaticKeyAdapter());
  },
);

test(
  "oidCipher: decrypt throws on unknown keyId",
  withFreshDevAdapter(async () => {
    const { ciphertext } = await encrypt("oid-for-unknown-keyid", "test");
    let threw = false;
    try {
      await decrypt(ciphertext, "nonexistent-key-version", "test", makeReq());
    } catch (err: any) {
      threw = true;
      assert(
        err.message.includes("nonexistent-key-version") ||
          err.message.toLowerCase().includes("unknown"),
        `expected unknown keyId error, got: ${err.message}`,
      );
    }
    assert(threw, "unknown keyId must throw");
  }),
);

// ── AzureKeyVaultAdapter stub ──────────────────────────────────────────────

test("oidCipher: AzureKeyVaultAdapter.wrapDek throws (stub)", async () => {
  const adapter = new AzureKeyVaultAdapter();
  let threw = false;
  try {
    await adapter.wrapDek(Buffer.alloc(32));
  } catch (err: any) {
    threw = true;
    assert(
      err.message.includes("AzureKeyVaultAdapter"),
      `expected AzureKeyVaultAdapter in error, got: ${err.message}`,
    );
  }
  assert(threw, "AzureKeyVaultAdapter.wrapDek must throw (stub not implemented)");
});

test("oidCipher: AzureKeyVaultAdapter.unwrapDek throws (stub)", async () => {
  const adapter = new AzureKeyVaultAdapter();
  let threw = false;
  try {
    await adapter.unwrapDek(Buffer.alloc(60), "some-key-version");
  } catch (err: any) {
    threw = true;
    assert(
      err.message.includes("AzureKeyVaultAdapter"),
      `expected AzureKeyVaultAdapter in error, got: ${err.message}`,
    );
  }
  assert(threw, "AzureKeyVaultAdapter.unwrapDek must throw (stub not implemented)");
});

// ── Tampered ciphertext ────────────────────────────────────────────────────

test(
  "oidCipher: decrypt throws when ciphertext bytes are tampered",
  withFreshDevAdapter(async () => {
    const { ciphertext, keyId } = await encrypt("tamper-test-oid", "test");
    // Flip a byte in the data_ciphertext region (near the end)
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] ^= 0xff;

    let threw = false;
    try {
      await decrypt(tampered, keyId, "tamper test", makeReq());
    } catch {
      threw = true;
    }
    assert(threw, "GCM auth tag verification must reject tampered ciphertext");
  }),
);

// ── Visit integration: ciphertext written to DB ────────────────────────────

// NOTE: Full visit integration (ensureVisitForRouteRunStop writing ciphertext)
// is implicitly covered by the existing visits.test.ts suite, which calls
// ensureVisitForRouteRunStop. Those tests will now also exercise the
// encrypt() path. We add an explicit column-presence check here.

import { pool, createRouteRunFixture, cleanupFixture, deriveClientVisitIdLocal, FIXTURE_ACTOR_OID } from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";

test(
  "oidCipher: ensureVisitForRouteRunStop writes captured_by_oid_ciphertext and _key_id",
  withFreshDevAdapter(async () => {
    const client = await pool.connect();
    const f = await createRouteRunFixture(client);
    try {
      await ensureVisitForRouteRunStop(client, {
        routeRunStopId: f.routeRunStopId,
        actorOid: FIXTURE_ACTOR_OID,
        visitType: "service",
      });

      const row = await client.query(
        `SELECT actor_oid, captured_by_oid_ciphertext, captured_by_oid_key_id
         FROM core.visits WHERE client_visit_id = $1`,
        [deriveClientVisitIdLocal(f.routeRunStopId)],
      );
      assertEqual(row.rowCount, 1, "visit row exists");
      assert(
        row.rows[0].captured_by_oid_ciphertext !== null,
        "captured_by_oid_ciphertext must be populated",
      );
      assertEqual(
        row.rows[0].captured_by_oid_key_id,
        "dev-static-v1",
        "key_id matches dev adapter",
      );
      assertEqual(
        row.rows[0].actor_oid,
        FIXTURE_ACTOR_OID,
        "plaintext actor_oid retained for dual-write period",
      );
    } finally {
      await cleanupFixture(client, f);
      client.release();
    }
  }),
);
