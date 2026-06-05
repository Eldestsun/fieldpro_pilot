/**
 * S1-6 — SFTP Export Writer
 *
 * SECURITY — KEY-BASED AUTH ONLY:
 * This script uses SSH public-key authentication exclusively. Password auth is
 * never attempted, even if the remote server offers it. Rationale: password auth
 * over SFTP is susceptible to credential capture, brute force, and MitM attacks
 * on automated, unattended systems. Key-based auth with strict host-key checking
 * eliminates these attack surfaces.
 *
 * SECURITY — STRICT HOST KEY CHECKING:
 * The script refuses to connect to a host whose key is not listed in
 * SFTP_KNOWN_HOSTS_PATH. TOFU (Trust On First Use) is explicitly disabled.
 * The known_hosts file must be provisioned out-of-band by the operator before
 * the first run. A host-key mismatch is a fatal error, not a warning.
 * Only plain-text known_hosts entries are supported — hashed entries (|1|...)
 * are not parsed and will cause an "unknown host" error.
 *
 * DATA SENSITIVITY:
 * Exported files contain core.visits.captured_by_oid in plaintext during the
 * S1-13 dual-write period. These files carry the same access tier as the
 * audit_log table and must be protected accordingly. SFTP_REMOTE_DIR must
 * reside on a server with equivalent access controls to the audit_log.
 * Local staging files are cleaned up after a successful upload. On failure,
 * they are left in place for operator inspection.
 *
 * SCHEDULING:
 * This script is designed to be invoked by a cron job, systemd timer, or
 * equivalent scheduler. The recommended schedule is nightly at 02:00 local time.
 * Scheduling is an infrastructure concern deferred to Sprint 3 (S3-1).
 */

import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import * as zlib from "zlib";
import * as crypto from "crypto";
import * as os from "os";
import { promisify } from "util";
import SftpClient from "ssh2-sftp-client";
import { PoolClient } from "pg";
import { pool } from "../db";
import { writeAuditLog } from "../middleware/auditLog";

const gzip = promisify(zlib.gzip);

// ── Types ────────────────────────────────────────────────────────────────────

export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  privateKey: Buffer;
  knownHostsPath: string;
  remoteDir: string;
}

export interface OrgRow {
  id: string; // pg returns bigint as string
  name: string;
  slug: string;
  tenant_uuid: string | null;
}

interface OrgExportData {
  organization: Record<string, unknown>;
  locations: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  visits: Record<string, unknown>[];
  observations: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
  stop_effort_history: Record<string, unknown>[];
  stop_condition_history: Record<string, unknown>[];
  eam_bridge_route_log: Record<string, unknown>[];
}

export interface ExportedFile {
  localPath: string;
  remoteName: string;
  sha256: string;
}

export interface ExportOptions {
  /** Override staging directory (for tests). Defaults to /tmp/baseline-sftp-export */
  stagingDir?: string;
  /** Override timestamp string (for tests). Defaults to ISO 8601 without colons. */
  timestamp?: string;
  /** Skip SFTP upload and write local files only. Used when SFTP_ENABLED != "true". */
  skipUpload?: boolean;
}

// ── Configuration ─────────────────────────────────────────────────────────────

export function loadSftpConfig(): SftpConfig {
  const required = [
    "SFTP_HOST",
    "SFTP_USER",
    "SFTP_PRIVATE_KEY_PATH",
    "SFTP_KNOWN_HOSTS_PATH",
    "SFTP_REMOTE_DIR",
  ] as const;

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required SFTP env vars: ${missing.join(", ")}`);
  }

  const privateKeyPath = process.env.SFTP_PRIVATE_KEY_PATH!;
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`SFTP private key not found: ${privateKeyPath}`);
  }

  const knownHostsPath = process.env.SFTP_KNOWN_HOSTS_PATH!;
  if (!fs.existsSync(knownHostsPath)) {
    throw new Error(`SFTP known_hosts file not found: ${knownHostsPath}`);
  }

  return {
    host: process.env.SFTP_HOST!,
    port: Number(process.env.SFTP_PORT ?? 22),
    username: process.env.SFTP_USER!,
    privateKey: fs.readFileSync(privateKeyPath),
    knownHostsPath,
    remoteDir: process.env.SFTP_REMOTE_DIR!,
  };
}

// ── Known-hosts parsing ───────────────────────────────────────────────────────

/**
 * Parse a plain-text known_hosts file and return the expected SSH wire-format
 * public key for the given host:port as a Buffer. Returns null if no matching
 * entry exists.
 *
 * Hashed entries (|1|...) are skipped — the operator must provision the
 * known_hosts file without hashing (e.g. `ssh-keyscan -H` hashes; omit -H).
 */
export function findKnownHostKey(
  content: string,
  host: string,
  port: number,
): Buffer | null {
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("|1|")) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const [hostField, , keyB64] = parts;

    for (const entry of hostField.split(",")) {
      if (port === 22 && entry === host) {
        return Buffer.from(keyB64, "base64");
      }
      if (port !== 22 && entry === `[${host}]:${port}`) {
        return Buffer.from(keyB64, "base64");
      }
    }
  }
  return null;
}

// ── Database ─────────────────────────────────────────────────────────────────

async function fetchOrgs(client: PoolClient): Promise<OrgRow[]> {
  const res = await client.query<OrgRow>(
    "SELECT id, name, slug, tenant_uuid FROM organizations ORDER BY id",
  );
  return res.rows;
}

async function fetchOrgData(
  client: PoolClient,
  orgId: string,
): Promise<OrgExportData> {
  const orgRes = await client.query(
    "SELECT id, name, slug, created_at FROM organizations WHERE id = $1",
    [orgId],
  );

  const locRes = await client.query(
    "SELECT * FROM core.locations WHERE org_id = $1",
    [orgId],
  );

  // Identity now lives in the per-table sidecars (§3.2). LEFT JOIN and alias back
  // to the original column names so the export bundle format is unchanged.
  const assignRes = await client.query(
    `SELECT a.*, s.actor_ref AS created_by_oid
     FROM core.assignments a
     LEFT JOIN core.assignment_actor_audit s ON s.assignment_id = a.id
     WHERE a.org_id = $1`,
    [orgId],
  );

  // Include captured_by_oid (plaintext) AND the S1-13 ciphertext columns so
  // the bundle is consistent with the S1-4 export-and-delete format.
  const visitsRes = await client.query(
    `SELECT v.*, s.actor_ref AS actor_oid,
            s.actor_ref_ciphertext AS captured_by_oid_ciphertext,
            s.actor_ref_key_id     AS captured_by_oid_key_id
     FROM core.visits v
     LEFT JOIN core.visit_actor_audit s ON s.visit_id = v.id
     WHERE v.org_id = $1`,
    [orgId],
  );
  const visitIds: string[] = visitsRes.rows.map((r: any) => String(r.id));

  const obsRes = await client.query(
    `SELECT o.*, s.actor_ref AS created_by_oid
     FROM core.observations o
     LEFT JOIN core.observation_actor_audit s ON s.observation_id = o.id
     WHERE o.org_id = $1`,
    [orgId],
  );

  // core.evidence: metadata only — storage_key references blobs; blobs not included.
  const evRes = await client.query(
    `SELECT e.*, s.actor_ref AS captured_by_oid
     FROM core.evidence e
     LEFT JOIN core.evidence_actor_audit s ON s.evidence_id = e.id
     WHERE e.org_id = $1`,
    [orgId],
  );

  let stopEffort: Record<string, unknown>[] = [];
  let stopCondition: Record<string, unknown>[] = [];
  if (visitIds.length > 0) {
    const sehRes = await client.query(
      "SELECT * FROM stop_effort_history WHERE visit_id = ANY($1::bigint[])",
      [visitIds],
    );
    stopEffort = sehRes.rows;

    const schRes = await client.query(
      "SELECT * FROM stop_condition_history WHERE visit_id = ANY($1::bigint[])",
      [visitIds],
    );
    stopCondition = schRes.rows;
  }

  const eamRes = await client.query(
    "SELECT * FROM eam_bridge_route_log WHERE org_id = $1",
    [orgId],
  );

  return {
    organization: orgRes.rows[0] ?? {},
    locations: locRes.rows,
    assignments: assignRes.rows,
    visits: visitsRes.rows,
    observations: obsRes.rows,
    evidence: evRes.rows,
    stop_effort_history: stopEffort,
    stop_condition_history: stopCondition,
    eam_bridge_route_log: eamRes.rows,
  };
}

// ── CSV serialization ─────────────────────────────────────────────────────────

/**
 * Serialize an array of DB rows to RFC 4180-compliant CSV. Buffer values
 * (e.g. BYTEA columns) are hex-encoded to preserve binary data readably.
 * Returns an empty string for empty row arrays.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = Buffer.isBuffer(val) ? val.toString("hex") : String(val);
    if (
      s.includes(",") ||
      s.includes('"') ||
      s.includes("\n") ||
      s.includes("\r")
    ) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

// ── Minimal tar+gzip writer ───────────────────────────────────────────────────

/**
 * Create a gzipped POSIX ustar tar archive from in-memory file buffers.
 * This avoids an external `tar` dependency for a well-understood binary format.
 */
async function writeTarGz(
  files: { name: string; content: Buffer }[],
): Promise<Buffer> {
  const blocks: Buffer[] = [];
  const mtime = Math.floor(Date.now() / 1000);

  for (const file of files) {
    const header = Buffer.alloc(512, 0);

    // name (0-99)
    header.write(file.name.slice(0, 99), 0, "ascii");
    // mode (100-107)
    header.write("0000644\0", 100, "ascii");
    // uid, gid (108-115, 116-123)
    header.write("0000000\0", 108, "ascii");
    header.write("0000000\0", 116, "ascii");
    // size (124-135)
    header.write(
      file.content.length.toString(8).padStart(11, "0") + "\0",
      124,
      "ascii",
    );
    // mtime (136-147)
    header.write(mtime.toString(8).padStart(11, "0") + "\0", 136, "ascii");
    // checksum placeholder — 8 spaces (148-155)
    header.write("        ", 148, "ascii");
    // typeflag (156): '0' = regular file
    header.write("0", 156, "ascii");
    // magic + version (257-264)
    header.write("ustar\0", 257, "ascii");
    header.write("00", 263, "ascii");

    // Compute and write checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, "ascii");

    blocks.push(header);

    // File data padded to 512-byte boundary
    const padded = Math.ceil(file.content.length / 512) * 512;
    const dataBlock = Buffer.alloc(padded, 0);
    file.content.copy(dataBlock);
    blocks.push(dataBlock);
  }

  // End-of-archive: two zero 512-byte blocks
  blocks.push(Buffer.alloc(1024, 0));

  return gzip(Buffer.concat(blocks));
}

// ── SHA-256 ───────────────────────────────────────────────────────────────────

function sha256hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── File writing ──────────────────────────────────────────────────────────────

export async function writeOrgExportFiles(
  data: OrgExportData,
  orgSlug: string,
  timestamp: string,
  stagingDir: string,
): Promise<ExportedFile[]> {
  const orgDir = path.join(stagingDir, `${timestamp}_org-${orgSlug}`);
  fs.mkdirSync(orgDir, { recursive: true });

  const files: ExportedFile[] = [];

  // ── JSON bundle ────────────────────────────────────────────────────────────

  const jsonPayload = JSON.stringify(
    { exported_at: new Date().toISOString(), org_slug: orgSlug, tables: data },
    (_key, val) => {
      if (Buffer.isBuffer(val)) return val.toString("hex");
      if (typeof val === "bigint") return val.toString();
      return val;
    },
  );

  const jsonGz = await gzip(Buffer.from(jsonPayload, "utf8"));
  const jsonFilename = `${timestamp}_org-${orgSlug}.json.gz`;
  const jsonPath = path.join(orgDir, jsonFilename);
  fs.writeFileSync(jsonPath, jsonGz);

  const jsonSha256 = sha256hex(jsonGz);
  const jsonSha256Path = jsonPath + ".sha256";
  fs.writeFileSync(jsonSha256Path, `${jsonSha256}  ${jsonFilename}\n`, "utf8");

  files.push({ localPath: jsonPath, remoteName: jsonFilename, sha256: jsonSha256 });
  files.push({ localPath: jsonSha256Path, remoteName: `${jsonFilename}.sha256`, sha256: "" });

  // ── CSV tarball ────────────────────────────────────────────────────────────

  const tables: { name: string; rows: Record<string, unknown>[] }[] = [
    { name: "organizations", rows: [data.organization] },
    { name: "locations", rows: data.locations },
    { name: "assignments", rows: data.assignments },
    { name: "visits", rows: data.visits },
    { name: "observations", rows: data.observations },
    { name: "evidence", rows: data.evidence },
    { name: "stop_effort_history", rows: data.stop_effort_history },
    { name: "stop_condition_history", rows: data.stop_condition_history },
    { name: "eam_bridge_route_log", rows: data.eam_bridge_route_log },
  ];

  const csvFiles = tables.map((t) => ({
    name: `${t.name}.csv`,
    content: Buffer.from(toCsv(t.rows), "utf8"),
  }));

  const tarGz = await writeTarGz(csvFiles);
  const tarFilename = `${timestamp}_org-${orgSlug}.tar.gz`;
  const tarPath = path.join(orgDir, tarFilename);
  fs.writeFileSync(tarPath, tarGz);

  const tarSha256 = sha256hex(tarGz);
  const tarSha256Path = tarPath + ".sha256";
  fs.writeFileSync(tarSha256Path, `${tarSha256}  ${tarFilename}\n`, "utf8");

  files.push({ localPath: tarPath, remoteName: tarFilename, sha256: tarSha256 });
  files.push({ localPath: tarSha256Path, remoteName: `${tarFilename}.sha256`, sha256: "" });

  return files;
}

// ── SFTP upload ───────────────────────────────────────────────────────────────

export async function uploadViasSftp(
  config: SftpConfig,
  files: ExportedFile[],
): Promise<void> {
  const knownHostsContent = fs.readFileSync(config.knownHostsPath, "utf8");
  const expectedKey = findKnownHostKey(
    knownHostsContent,
    config.host,
    config.port,
  );

  if (!expectedKey) {
    throw new Error(
      `Host ${config.host}:${config.port} is not listed in ${config.knownHostsPath}. ` +
        "Provision the server host key before running the export.",
    );
  }

  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      // Key-based auth only. No password field = password auth never attempted.
      privateKey: config.privateKey,
      tryKeyboard: false,
      // Strict host key checking. The ParsedKey (ssh2 v1.x) exposes
      // getPublicSSH() which returns the SSH wire-format bytes — the same bytes
      // that are base64-encoded in the known_hosts file.
      hostVerifier: (hostKey: any): boolean => {
        const keyBuf: Buffer =
          typeof hostKey?.getPublicSSH === "function"
            ? (hostKey.getPublicSSH() as Buffer)
            : Buffer.isBuffer(hostKey)
              ? hostKey
              : Buffer.alloc(0);
        return expectedKey.equals(keyBuf);
      },
    } as any);

    const remoteBase = config.remoteDir.endsWith("/")
      ? config.remoteDir
      : config.remoteDir + "/";

    for (const file of files) {
      await sftp.put(file.localPath, remoteBase + file.remoteName);
    }
  } finally {
    await sftp.end().catch(() => {});
  }
}

// ── Audit log helper ──────────────────────────────────────────────────────────

function orgAuditUuid(org: OrgRow): string {
  if (org.tenant_uuid) return org.tenant_uuid;
  // Pilot mode: the org may have no tenant_uuid. Synthesise a stable UUID from
  // the bigint ID so the audit_log NOT NULL constraint is satisfied.
  const padded = String(org.id).padStart(12, "0");
  return `00000000-0000-0000-0000-${padded}`;
}

// ── Per-org pipeline ──────────────────────────────────────────────────────────

export async function exportOrg(
  org: OrgRow,
  client: PoolClient,
  config: SftpConfig | null,
  opts: ExportOptions,
): Promise<ExportedFile[]> {
  const timestamp =
    opts.timestamp ??
    new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const stagingDir =
    opts.stagingDir ?? path.join(os.tmpdir(), "baseline-sftp-export");

  fs.mkdirSync(stagingDir, { recursive: true });

  const data = await fetchOrgData(client, org.id);
  const files = await writeOrgExportFiles(data, org.slug, timestamp, stagingDir);

  const destination = opts.skipUpload ? "local-only" : "sftp";
  const exportFileNames = files
    .filter((f) => !f.remoteName.endsWith(".sha256"))
    .map((f) => f.remoteName);

  if (!opts.skipUpload && config) {
    await uploadViasSftp(config, files);

    // Clean up local staging files after successful upload. Leave them on
    // failure for operator inspection (the finally block below does not run
    // cleanup so a throw from uploadViasSftp reaches the caller with files
    // intact).
    const orgDir = path.join(stagingDir, `${timestamp}_org-${org.slug}`);
    try {
      fs.rmSync(orgDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — non-fatal.
    }
  }

  // Audit entry written after successful export (or local-only run).
  await writeAuditLog({
    actor_oid: "sftp-export-system",
    org_id: org.id,
    action: "export.data_export",
    resource_type: "export",
    detail: {
      destination,
      files: exportFileNames,
      format: "json+csv",
      org_id: org.id,
    },
  });

  return files;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function run(opts: ExportOptions = {}): Promise<void> {
  const enabled = process.env.SFTP_ENABLED?.toLowerCase();
  const skipUpload = opts.skipUpload ?? enabled !== "true";

  if (skipUpload) {
    console.log(
      'SFTP_ENABLED is not "true" — running in local-file-only mode. No upload will occur.',
    );
  }

  const config = skipUpload ? null : loadSftpConfig();

  let orgCount = 0;
  let orgSucceeded = 0;
  let orgFailed = 0;

  const client = await pool.connect();
  try {
    const orgs = await fetchOrgs(client);
    orgCount = orgs.length;
    console.log(`Found ${orgCount} organization(s) to export.`);

    for (const org of orgs) {
      try {
        console.log(`  Exporting org: ${org.slug} (id=${org.id})`);
        const files = await exportOrg(org, client, config, { ...opts, skipUpload });
        const dataFiles = files.filter((f) => !f.remoteName.endsWith(".sha256"));
        console.log(`    → ${dataFiles.length} export file(s) written`);
        orgSucceeded++;
      } catch (err) {
        orgFailed++;
        console.error(
          `  ERROR exporting org ${org.slug}:`,
          err instanceof Error ? err.message : err,
        );
        // One org's failure does not block others.
      }
    }
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }

  console.log(
    `\nExport complete: ${orgSucceeded}/${orgCount} succeeded, ${orgFailed} failed.`,
  );

  if (orgFailed > 0) {
    process.exitCode = 1;
  }
}

// Standalone: pnpm sftp:export
if (require.main === module) {
  run().catch((err) => {
    console.error(
      "SFTP export fatal error:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  });
}
