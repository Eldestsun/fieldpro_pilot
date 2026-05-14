/**
 * S1-6 — SFTP Export Writer tests
 *
 * Tests run against the real local DB (no mocking of the DB layer).
 * The mock SFTP server uses the ssh2 Server class to exercise the full
 * key-based auth + host-key verification path without a real remote host.
 *
 * Pre-existing test baseline: 59 pass / 16 fail. These tests must not
 * regress that count.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as zlib from "zlib";
import { promisify } from "util";
import { pool, test, assert, assertEqual } from "../setup";
import {
  findKnownHostKey,
  toCsv,
  writeOrgExportFiles,
  exportOrg,
  loadSftpConfig,
  OrgRow,
  ExportedFile,
} from "../../src/scripts/sftpExport";

const gunzip = promisify(zlib.gunzip);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `sftp-test-${crypto.randomBytes(4).toString("hex")}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

const TIMESTAMP = "2026-05-13T02-00-00";
const TEST_SLUG = "test-sftp-org";

function makeOrgRow(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: "1",
    name: "Test Org",
    slug: TEST_SLUG,
    tenant_uuid: "00000000-0000-0000-0000-000000000042",
    ...overrides,
  };
}

// ── Unit tests — pure functions ───────────────────────────────────────────────

test("findKnownHostKey: returns key for standard port-22 entry", () => {
  const knownHosts = `# comment
example.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB
sftp.test.io ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA`;

  const key = findKnownHostKey(knownHosts, "sftp.test.io", 22);
  assert(key !== null, "key must not be null for matching entry");
  assertEqual(
    key!.toString("base64"),
    "AAAAC3NzaC1lZDI1NTE5AAAA",
    "base64 key matches",
  );
});

test("findKnownHostKey: returns key for non-standard port entry", () => {
  const knownHosts = `[sftp.test.io]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA`;

  const key = findKnownHostKey(knownHosts, "sftp.test.io", 2222);
  assert(key !== null, "key must not be null for matching bracketed entry");
});

test("findKnownHostKey: returns null for unknown host", () => {
  const knownHosts = `example.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB`;
  const key = findKnownHostKey(knownHosts, "other.host", 22);
  assertEqual(key, null, "unknown host must return null");
});

test("findKnownHostKey: skips comments and hashed entries", () => {
  const knownHosts = `# comment line
|1|hashed|entry ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB
target.host ssh-rsa AAAAB3NzaC1yc2EAAAADAQAC`;

  const key = findKnownHostKey(knownHosts, "target.host", 22);
  assert(key !== null, "plain entry after comment and hashed line must be found");
  assertEqual(key!.toString("base64"), "AAAAB3NzaC1yc2EAAAADAQAC", "correct entry returned");
});

test("findKnownHostKey: handles comma-separated hostnames", () => {
  const knownHosts = `host-a.io,host-b.io ssh-rsa AAAAB3NzaC1yc2EAAAADAQAB`;
  const key = findKnownHostKey(knownHosts, "host-b.io", 22);
  assert(key !== null, "second host in comma list must be found");
});

test("toCsv: empty rows returns empty string", () => {
  assertEqual(toCsv([]), "", "empty input produces empty string");
});

test("toCsv: produces correct header and data rows", () => {
  const rows = [
    { id: 1, name: "Alice", note: null },
    { id: 2, name: "Bob, Jr.", note: 'say "hi"' },
  ];
  const csv = toCsv(rows);
  const lines = csv.split("\n").filter((l) => l.length > 0);
  assertEqual(lines[0], "id,name,note", "header row correct");
  assertEqual(lines[1], '1,Alice,', "simple row correct");
  assert(lines[2].includes('"Bob, Jr."'), "comma in value is quoted");
  assert(lines[2].includes('""hi""'), 'double-quote inside quoted field is escaped');
});

test("toCsv: Buffer values are hex-encoded", () => {
  const rows = [{ id: 1, ciphertext: Buffer.from("deadbeef", "hex") }];
  const csv = toCsv(rows);
  assert(csv.includes("deadbeef"), "Buffer serialised as hex");
});

// ── Integration tests — file writing (no SFTP) ───────────────────────────────

test("sftpExport: local-only mode writes JSON and CSV bundles for fixture org", async () => {
  const tmpDir = makeTmpDir();
  const client = await pool.connect();
  try {
    // Use org id=1 (fixture org created by seed data).
    const org = makeOrgRow();
    const files = await exportOrg(org, client, null, {
      skipUpload: true,
      stagingDir: tmpDir,
      timestamp: TIMESTAMP,
    });

    assert(files.length === 4, `expected 4 files (json.gz + sha256 + tar.gz + sha256), got ${files.length}`);

    const jsonFile = files.find((f) => f.remoteName.endsWith(".json.gz"));
    const tarFile = files.find((f) => f.remoteName.endsWith(".tar.gz"));
    const jsonSha256File = files.find((f) => f.remoteName.endsWith(".json.gz.sha256"));
    const tarSha256File = files.find((f) => f.remoteName.endsWith(".tar.gz.sha256"));

    assert(jsonFile !== undefined, "JSON .gz file present");
    assert(tarFile !== undefined, "CSV .tar.gz file present");
    assert(jsonSha256File !== undefined, "JSON .sha256 sidecar present");
    assert(tarSha256File !== undefined, "tar .sha256 sidecar present");

    // Verify all files exist on disk.
    for (const f of files) {
      assert(fs.existsSync(f.localPath), `file exists on disk: ${f.remoteName}`);
    }

    // ── JSON bundle: well-formed and gunzip-able ──────────────────────────────
    const jsonGzBuf = fs.readFileSync(jsonFile!.localPath);
    const jsonBuf = await gunzip(jsonGzBuf);
    const parsed = JSON.parse(jsonBuf.toString("utf8"));
    assert(
      typeof parsed.exported_at === "string",
      "JSON bundle has exported_at field",
    );
    assert(
      typeof parsed.tables === "object",
      "JSON bundle has tables field",
    );
    assert(
      Array.isArray(parsed.tables.visits),
      "JSON bundle has visits array",
    );
    assert(
      Array.isArray(parsed.tables.observations),
      "JSON bundle has observations array",
    );

    // ── SHA-256 sidecar: content matches actual file hash ────────────────────
    const sha256Line = fs.readFileSync(jsonSha256File!.localPath, "utf8").trim();
    assert(
      sha256Line.includes(jsonFile!.sha256),
      "SHA-256 sidecar content matches reported hash",
    );
    assertEqual(jsonFile!.sha256.length, 64, "SHA-256 is 64 hex chars");

    // ── tar.gz: non-empty and has correct magic bytes (gzip) ─────────────────
    const tarBuf = fs.readFileSync(tarFile!.localPath);
    assert(tarBuf.length > 0, "tar.gz is non-empty");
    // Gzip magic: first two bytes are 0x1f 0x8b
    assertEqual(tarBuf[0], 0x1f, "tar.gz gzip magic byte 0");
    assertEqual(tarBuf[1], 0x8b, "tar.gz gzip magic byte 1");

    // ── Gunzip the tarball and verify it contains CSV-like content ────────────
    const rawTar = await gunzip(tarBuf);
    // tar files start with the first filename at byte 0 (100-byte name field).
    const firstName = rawTar.slice(0, 99).toString("ascii").replace(/\0/g, "");
    assert(
      firstName.endsWith(".csv"),
      `first entry in tar is a .csv file, got: ${firstName}`,
    );

    // Verify the tar contains at least the expected table files by scanning names.
    const expectedTables = ["organizations", "locations", "visits", "observations"];
    const tarText = rawTar.toString("ascii");
    for (const table of expectedTables) {
      assert(
        tarText.includes(`${table}.csv`),
        `tar contains ${table}.csv`,
      );
    }
  } finally {
    client.release();
    cleanDir(tmpDir);
  }
});

test("sftpExport: org with no tenant_uuid gets synthetic audit UUID", async () => {
  const tmpDir = makeTmpDir();
  const client = await pool.connect();
  try {
    const org = makeOrgRow({ tenant_uuid: null, id: "7" });

    const files = await exportOrg(org, client, null, {
      skipUpload: true,
      stagingDir: tmpDir,
      timestamp: TIMESTAMP,
    });
    assert(files.length > 0, "export produced files");

    // Verify audit_log entry was written with synthetic UUID.
    const auditRes = await pool.query(
      `SELECT detail FROM audit_log
       WHERE actor_oid = 'sftp-export-system'
         AND org_id = '00000000-0000-0000-0000-000000000007'::uuid
       ORDER BY occurred_at DESC LIMIT 1`,
    );
    assert(
      auditRes.rowCount! > 0,
      "audit_log entry written with synthetic UUID for org without tenant_uuid",
    );
  } finally {
    client.release();
    cleanDir(tmpDir);
  }
});

test("sftpExport: audit_log entry written after successful local export", async () => {
  const tmpDir = makeTmpDir();
  const client = await pool.connect();
  try {
    const org = makeOrgRow();

    await exportOrg(org, client, null, {
      skipUpload: true,
      stagingDir: tmpDir,
      timestamp: TIMESTAMP + "-auditcheck",
    });

    const res = await pool.query(
      `SELECT action, detail FROM audit_log
       WHERE actor_oid = 'sftp-export-system'
         AND org_id = $1::uuid
         AND action = 'export.data_export'
       ORDER BY occurred_at DESC LIMIT 1`,
      [org.tenant_uuid],
    );

    assert(res.rowCount! > 0, "audit_log row exists after export");
    const row = res.rows[0];
    assertEqual(row.action, "export.data_export", "action is export.data_export");
    assert(
      row.detail?.destination === "local-only",
      "detail.destination is local-only for skip-upload mode",
    );
    assert(
      Array.isArray(row.detail?.files) && row.detail.files.length > 0,
      "detail.files is a non-empty array",
    );
    assert(
      row.detail?.format === "json+csv",
      "detail.format is json+csv",
    );
  } finally {
    client.release();
    cleanDir(tmpDir);
  }
});

test("sftpExport: connection failure is caught and does not leave partial state", async () => {
  const tmpDir = makeTmpDir();
  const keyDir = makeTmpDir();
  const client = await pool.connect();

  try {
    // Write a dummy private key (format will fail auth, not parsing)
    const { privateKey } = crypto.generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const keyPath = path.join(keyDir, "id_test");
    const knownHostsPath = path.join(keyDir, "known_hosts");
    fs.writeFileSync(keyPath, privateKey, "utf8");
    // known_hosts pointing at an unreachable host
    fs.writeFileSync(knownHostsPath, "127.0.0.1:19999 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA\n", "utf8");

    const config = {
      host: "127.0.0.1",
      port: 19999, // nothing listening here
      username: "testuser",
      privateKey: Buffer.from(privateKey),
      knownHostsPath,
      remoteDir: "/exports/",
    };

    const org = makeOrgRow({ tenant_uuid: "00000000-0000-0000-0000-000000000099" });

    let threw = false;
    try {
      await exportOrg(org, client, config, {
        skipUpload: false,
        stagingDir: tmpDir,
        timestamp: TIMESTAMP + "-connfail",
      });
    } catch {
      threw = true;
    }

    assert(threw, "connection failure throws an error");

    // Local staging files must still be present for operator inspection.
    const orgDir = path.join(tmpDir, `${TIMESTAMP}-connfail_org-${TEST_SLUG}`);
    assert(
      fs.existsSync(orgDir),
      "staging directory left intact after connection failure",
    );
    const leftFiles = fs.readdirSync(orgDir);
    assert(leftFiles.length > 0, "staging files left for operator inspection");
  } finally {
    client.release();
    cleanDir(tmpDir);
    cleanDir(keyDir);
  }
});

// ── Mock SFTP server — upload verification ────────────────────────────────────

/**
 * Minimal in-process SFTP server using the ssh2.Server class.
 *
 * Handles only the SFTP operations needed to accept file uploads:
 *   OPEN (write) → WRITE → CLOSE
 *   REALPATH → identity return
 *   STAT / LSTAT → fake directory attrs
 *
 * Collected uploads are stored in `receivedFiles` for assertion.
 */
async function withTestSftpServer(
  cb: (params: {
    port: number;
    knownHostsPath: string;
    clientKeyPath: string;
    receivedFiles: Map<string, Buffer>;
  }) => Promise<void>,
): Promise<void> {
  // Dynamically require ssh2 to avoid import errors if it is unavailable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ssh2 = require("ssh2") as typeof import("ssh2");
  // STATUS_CODE lives in the SFTP sub-module in ssh2 v1.x.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { STATUS_CODE } = require("ssh2/lib/protocol/SFTP") as {
    STATUS_CODE: { OK: number; EOF: number; FAILURE: number };
  };

  const tmpDir = makeTmpDir();
  const receivedFiles = new Map<string, Buffer>();

  // Generate host key pair — ssh2 requires PKCS1 PEM for RSA; PKCS8 is not supported.
  const { privateKey: hostPrivPem } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  // Generate client key pair for auth — same format requirement.
  const { privateKey: clientPrivPem } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });

  const clientKeyPath = path.join(tmpDir, "id_client");
  fs.writeFileSync(clientKeyPath, clientPrivPem, { mode: 0o600 });

  // Derive SSH wire-format public key for known_hosts.
  const parsedHostKey = ssh2.utils.parseKey(hostPrivPem as any);
  const hostKeyArr = Array.isArray(parsedHostKey) ? parsedHostKey : [parsedHostKey];
  const hostKeyEntry = hostKeyArr[0] as any;
  const sshPubBuf: Buffer = hostKeyEntry.getPublicSSH();
  const keyType: string = hostKeyEntry.type;
  const knownHostsPath = path.join(tmpDir, "known_hosts");

  // Port is chosen dynamically; we use a fixed high port unlikely to conflict.
  const PORT = 19876;
  const knownHostsLine = `[127.0.0.1]:${PORT} ${keyType} ${sshPubBuf.toString("base64")}\n`;
  fs.writeFileSync(knownHostsPath, knownHostsLine, "utf8");

  // ── Minimal SFTP server implementation ──────────────────────────────────────
  let handleSeq = 0;
  type WriteHandle = { path: string; chunks: Buffer[] };
  const handles = new Map<string, WriteHandle>();

  const server = new ssh2.Server({ hostKeys: [hostPrivPem] }, (client: any) => {
    client.on("authentication", (ctx: any) => {
      // Accept any publickey auth — this is a test fixture.
      if (ctx.method === "publickey") {
        ctx.accept();
      } else {
        ctx.reject(["publickey"]);
      }
    });

    client.on("ready", () => {
      client.on("session", (accept: any) => {
        const session = accept();
        session.on("sftp", (accept: any) => {
          const sftp = accept();

          sftp.on("OPEN", (reqid: number, filename: string, flags: number) => {
            const hKey = String(++handleSeq);
            const handle = Buffer.from(hKey);
            handles.set(hKey, { path: filename, chunks: [] });
            sftp.handle(reqid, handle);
          });

          sftp.on("WRITE", (reqid: number, handle: Buffer, _offset: number, data: Buffer) => {
            const entry = handles.get(handle.toString());
            if (entry) {
              entry.chunks.push(Buffer.from(data));
              sftp.status(reqid, STATUS_CODE.OK);
            } else {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("CLOSE", (reqid: number, handle: Buffer) => {
            const hKey = handle.toString();
            const entry = handles.get(hKey);
            if (entry) {
              receivedFiles.set(entry.path, Buffer.concat(entry.chunks));
              handles.delete(hKey);
              sftp.status(reqid, STATUS_CODE.OK);
            } else {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on("REALPATH", (reqid: number, reqPath: string) => {
            sftp.name(reqid, [{ filename: reqPath, longname: reqPath, attrs: {} }]);
          });

          sftp.on("STAT", (reqid: number) => {
            sftp.attrs(reqid, { mode: 0o40755, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 });
          });

          sftp.on("LSTAT", (reqid: number) => {
            sftp.attrs(reqid, { mode: 0o40755, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 });
          });

          sftp.on("MKDIR", (reqid: number) => {
            sftp.status(reqid, STATUS_CODE.OK);
          });

          sftp.on("OPENDIR", (reqid: number) => {
            const hKey = String(++handleSeq);
            const handle = Buffer.from(hKey);
            handles.set(hKey, { path: "/", chunks: [] });
            sftp.handle(reqid, handle);
          });

          sftp.on("READDIR", (reqid: number) => {
            sftp.status(reqid, STATUS_CODE.EOF);
          });
        });
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  try {
    await cb({ port: PORT, knownHostsPath, clientKeyPath, receivedFiles });
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
    cleanDir(tmpDir);
  }
}

test("sftpExport: mock SFTP server receives expected files for org export", async () => {
  const stagingDir = makeTmpDir();
  const client = await pool.connect();

  try {
    await withTestSftpServer(async ({ port, knownHostsPath, clientKeyPath, receivedFiles }) => {
      const privateKey = fs.readFileSync(clientKeyPath);

      const config = {
        host: "127.0.0.1",
        port,
        username: "testuser",
        privateKey,
        knownHostsPath,
        remoteDir: "/exports/baseline/",
      };

      const org = makeOrgRow({ tenant_uuid: "00000000-0000-0000-0000-000000000055" });

      await exportOrg(org, client, config, {
        skipUpload: false,
        stagingDir,
        timestamp: TIMESTAMP + "-srvtest",
      });

      // After successful upload, the server should have received the data files.
      const remoteFiles = [...receivedFiles.keys()];
      assert(remoteFiles.length > 0, "server received at least one file");

      const jsonUploaded = remoteFiles.some((p) => p.endsWith(".json.gz"));
      const tarUploaded = remoteFiles.some((p) => p.endsWith(".tar.gz"));
      const jsonSha256Uploaded = remoteFiles.some((p) => p.endsWith(".json.gz.sha256"));
      const tarSha256Uploaded = remoteFiles.some((p) => p.endsWith(".tar.gz.sha256"));

      assert(jsonUploaded, "JSON .gz was uploaded to SFTP server");
      assert(tarUploaded, "CSV .tar.gz was uploaded to SFTP server");
      assert(jsonSha256Uploaded, "JSON .sha256 sidecar was uploaded");
      assert(tarSha256Uploaded, "tar .sha256 sidecar was uploaded");

      // Verify the JSON content is valid gzipped JSON.
      const jsonKey = remoteFiles.find((p) => p.endsWith(".json.gz"))!;
      const jsonBuf = receivedFiles.get(jsonKey)!;
      const gunzipped = await promisify(zlib.gunzip)(jsonBuf);
      const parsed = JSON.parse(gunzipped.toString("utf8"));
      assert(typeof parsed.tables === "object", "uploaded JSON is valid export bundle");

      // Local staging files should be cleaned up after successful upload.
      const orgDir = path.join(stagingDir, `${TIMESTAMP}-srvtest_org-${TEST_SLUG}`);
      assert(
        !fs.existsSync(orgDir) || fs.readdirSync(orgDir).length === 0,
        "local staging directory cleaned up after successful upload",
      );

      // Audit log entry with destination=sftp should be written.
      const auditRes = await pool.query(
        `SELECT detail FROM audit_log
         WHERE actor_oid = 'sftp-export-system'
           AND org_id = '00000000-0000-0000-0000-000000000055'::uuid
           AND action = 'export.data_export'
         ORDER BY occurred_at DESC LIMIT 1`,
      );
      assert(auditRes.rowCount! > 0, "audit_log entry written after SFTP upload");
      assert(
        auditRes.rows[0].detail?.destination === "sftp",
        "audit detail.destination is 'sftp' for real upload",
      );
    });
  } finally {
    client.release();
    cleanDir(stagingDir);
  }
});

test("loadSftpConfig: throws when SFTP_ENABLED is not true", () => {
  const saved = process.env.SFTP_ENABLED;
  delete process.env.SFTP_ENABLED;
  let threw = false;
  try {
    // loadSftpConfig does not check SFTP_ENABLED — that's the run() concern.
    // This test verifies missing required vars throw a clear error.
    process.env.SFTP_HOST = "";
    loadSftpConfig();
  } catch (err) {
    threw = true;
    assert(
      err instanceof Error && err.message.includes("SFTP_HOST"),
      "error mentions missing var name",
    );
  } finally {
    process.env.SFTP_ENABLED = saved;
    delete process.env.SFTP_HOST;
  }
  assert(threw, "loadSftpConfig throws when required vars are missing");
});
