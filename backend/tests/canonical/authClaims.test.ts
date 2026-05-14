import { test, assert } from "../setup";
import { assertClaims } from "../../src/authz";

// authz.ts loads dotenv at module load, so process.env has the configured values here.
const TENANT_ID  = process.env.AZURE_TENANT_ID   as string;
const CLIENT_ID  = process.env.AZURE_API_AUDIENCE as string;
const VALID_ISS  = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

function validPayload(overrides: Record<string, unknown> = {}): any {
  return {
    aud: CLIENT_ID,
    iss: VALID_ISS,
    oid: "test-oid-abc123",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function assertThrows(fn: () => void, expectedFragment: string, label: string): void {
  let threw = false;
  try {
    fn();
  } catch (err: any) {
    threw = true;
    assert(
      err.message.includes(expectedFragment),
      `${label}: expected "${expectedFragment}" in error, got "${err.message}"`
    );
  }
  assert(threw, `${label}: expected an error to be thrown`);
}

test("assertClaims: accepts valid payload with string aud", () => {
  assertClaims(validPayload());
});

test("assertClaims: accepts valid payload with api:// aud prefix", () => {
  assertClaims(validPayload({ aud: `api://${CLIENT_ID}` }));
});

test("assertClaims: accepts array aud containing CLIENT_ID", () => {
  assertClaims(validPayload({ aud: [CLIENT_ID, `api://${CLIENT_ID}`] }));
});

test("assertClaims: rejects unknown aud", () => {
  assertThrows(
    () => assertClaims(validPayload({ aud: "not-a-valid-audience" })),
    "Invalid aud claim",
    "unknown aud"
  );
});

test("assertClaims: rejects sts.windows.net issuer (v1.0 form)", () => {
  assertThrows(
    () => assertClaims(validPayload({ iss: `https://sts.windows.net/${TENANT_ID}/` })),
    "Invalid iss claim",
    "v1.0 issuer"
  );
});

test("assertClaims: rejects wrong tenant in iss", () => {
  assertThrows(
    () => assertClaims(validPayload({ iss: "https://login.microsoftonline.com/wrong-tenant/v2.0" })),
    "Invalid iss claim",
    "wrong tenant iss"
  );
});

test("assertClaims: rejects missing oid", () => {
  const payload = validPayload();
  delete payload.oid;
  assertThrows(() => assertClaims(payload), "Missing or invalid oid claim", "missing oid");
});

test("assertClaims: rejects empty string oid", () => {
  assertThrows(
    () => assertClaims(validPayload({ oid: "" })),
    "Missing or invalid oid claim",
    "empty oid"
  );
});

test("assertClaims: rejects non-string oid", () => {
  assertThrows(
    () => assertClaims(validPayload({ oid: 12345 })),
    "Missing or invalid oid claim",
    "numeric oid"
  );
});
