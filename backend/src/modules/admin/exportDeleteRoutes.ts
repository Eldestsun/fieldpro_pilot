import { Router, Request, Response, NextFunction } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { promisify } from "util";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import { auditWrite, reqOrgId, reqTenantUuid } from "../../middleware/auditWrite";

const gzip = promisify(zlib.gzip);

export const exportDeleteRoutes = Router();

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  requireAnyRole(["Admin"])(req as any, res, next);
};

exportDeleteRoutes.use(requireAuth, requireAdmin);

// Staging directory for export bundles. Override via EXPORT_STAGING_DIR env var.
const EXPORT_STAGING_DIR =
  process.env.EXPORT_STAGING_DIR ?? "/tmp/baseline-exports";

function ensureStagingDir(): void {
  if (!fs.existsSync(EXPORT_STAGING_DIR)) {
    fs.mkdirSync(EXPORT_STAGING_DIR, { recursive: true });
  }
}

// ── Org context under fail-closed RLS (MT-2) ─────────────────────────────
//
// This flow straddles BOTH org notions in one connection:
//   * export_delete_tokens.org_id is the Azure Entra TENANT UUID (text —
//     intentional, ISSUE-052), and its RLS policy compares that UUID against
//     app.current_org_id;
//   * every canonical table + audit_log is scoped by the NUMERIC
//     organizations.id, and their policies compare that number against the
//     same GUC.
// So the session GUC must hold the tenant UUID for token statements and the
// numeric id for canonical/audit statements. setOrgCtx flips it per statement
// group on the checked-out client; every handler resets it to '' in finally
// (mirroring withOrgContext) so a pooled connection never leaks context.
//
// Resolution is FAIL-CLOSED (ISSUE-013): reqOrgId → resolveNumericOrgId
// throws OrgResolutionError (status 403) when the caller's tenant UUID does
// not match an organizations row. There is deliberately NO default-org
// fallback — an export-delete for an unrecognized tenant must refuse loudly,
// never silently scope to the wrong org. (The old resolveOrgInt helper here,
// with its ORDER BY id LIMIT 1 fallback, was exactly that fail-open pattern —
// removed.)
async function setOrgCtx(client: any, value: string): Promise<void> {
  await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [
    value,
  ]);
}

async function resetOrgCtx(client: any): Promise<void> {
  try {
    await client.query(`SELECT set_config('app.current_org_id', '', false)`);
  } catch {
    // best-effort reset; release still returns the client to the pool
  }
}

// ── POST /api/admin/export-and-delete/request ────────────────────────────
//
// Generates a full org data export (gzipped JSON), stores a confirmation
// token hash, and returns the raw token exactly once. The token must be
// presented to /execute within 7 days to trigger the hard delete.
//
// Writes two audit entries: export.data_export and export.delete_confirm.
// (S1-2 note: export.data_export was deferred because no export endpoint
// existed; this endpoint fulfils that wire as specified in the S1-4 spec.)

exportDeleteRoutes.post(
  "/admin/export-and-delete/request",
  async (req: Request, res: Response) => {
    const actorOid = (req as any).user?.oid ?? "unknown";
    const tenantUuid = reqTenantUuid(req);  // for export_delete_tokens (TEXT org_id)

    // FAIL-CLOSED resolution (ISSUE-013): tenant UUID → numeric
    // organizations.id. Throws OrgResolutionError (403) on no match — never
    // defaults to an org. Must happen before anything is read or written.
    let orgIdNum: number;
    try {
      orgIdNum = await reqOrgId(req);
    } catch (err: any) {
      console.error("[export-delete/request] org resolution refused:", err.message);
      return res.status(err.status ?? 500).json({ error: err.message });
    }
    const orgInt = BigInt(orgIdNum);

    const client = await pool.connect();
    try {
      ensureStagingDir();

      // MT-2 fail-closed RLS: without org context every RLS read below
      // returns 0 rows. Scope the canonical + audit reads to the RESOLVED org.
      await setOrgCtx(client, String(orgIdNum));

      // ── Build export bundle ──────────────────────────────────────────────
      const exportData: Record<string, unknown[]> = {};

      // organizations (no RLS on this table)
      const orgsRes = await client.query(
        "SELECT id, name, slug, created_at FROM organizations WHERE id = $1",
        [orgInt],
      );
      exportData.organizations = orgsRes.rows;

      // core.locations (RLS bypasses when app.current_org_id is not set)
      const locRes = await client.query(
        "SELECT * FROM core.locations WHERE org_id = $1",
        [orgInt],
      );
      exportData.locations = locRes.rows;

      // Identity now lives in the per-table sidecars (§3.2). LEFT JOIN and alias
      // back to the original column names so the export bundle format is unchanged.
      // core.assignments
      const assignRes = await client.query(
        `SELECT a.*, s.actor_ref AS created_by_oid
         FROM core.assignments a
         LEFT JOIN core.assignment_actor_audit s ON s.assignment_id = a.id
         WHERE a.org_id = $1`,
        [orgInt],
      );
      exportData.assignments = assignRes.rows;

      // core.visits — include both plaintext and KMS-ciphertext OID fields (relocated to sidecar)
      const visitsRes = await client.query(
        `SELECT v.*, s.actor_ref AS actor_oid,
                s.actor_ref_ciphertext AS captured_by_oid_ciphertext,
                s.actor_ref_key_id     AS captured_by_oid_key_id
         FROM core.visits v
         LEFT JOIN core.visit_actor_audit s ON s.visit_id = v.id
         WHERE v.org_id = $1`,
        [orgInt],
      );
      exportData.visits = visitsRes.rows;
      const visitIds: bigint[] = visitsRes.rows.map((r: any) => BigInt(r.id));

      // core.observations
      const obsRes = await client.query(
        `SELECT o.*, s.actor_ref AS created_by_oid
         FROM core.observations o
         LEFT JOIN core.observation_actor_audit s ON s.observation_id = o.id
         WHERE o.org_id = $1`,
        [orgInt],
      );
      exportData.observations = obsRes.rows;

      // core.evidence (metadata only — storage_key references blobs, blobs not included)
      const evRes = await client.query(
        `SELECT e.*, s.actor_ref AS captured_by_oid
         FROM core.evidence e
         LEFT JOIN core.evidence_actor_audit s ON s.evidence_id = e.id
         WHERE e.org_id = $1`,
        [orgInt],
      );
      exportData.evidence = evRes.rows;

      // stop_effort_history and stop_condition_history — scoped via visit_id FK
      if (visitIds.length > 0) {
        const visitIdStrs = visitIds.map(String);
        const sehRes = await client.query(
          "SELECT * FROM stop_effort_history WHERE visit_id = ANY($1::bigint[])",
          [visitIdStrs],
        );
        exportData.stop_effort_history = sehRes.rows;
        const schRes = await client.query(
          "SELECT * FROM stop_condition_history WHERE visit_id = ANY($1::bigint[])",
          [visitIdStrs],
        );
        exportData.stop_condition_history = schRes.rows;
      } else {
        exportData.stop_effort_history = [];
        exportData.stop_condition_history = [];
      }

      // audit_log — scoped by bigint org_id (Phase 3: column changed from uuid → bigint)
      const auditRes = await client.query(
        "SELECT * FROM audit_log WHERE org_id = $1",
        [orgInt],
      );
      exportData.audit_log = auditRes.rows;

      // eam_bridge_route_log — scoped by bigint org_id
      const eamRes = await client.query(
        "SELECT * FROM eam_bridge_route_log WHERE org_id = $1",
        [orgInt],
      );
      exportData.eam_bridge_route_log = eamRes.rows;

      // ── Write gzipped bundle ─────────────────────────────────────────────
      const bundleJson = JSON.stringify({
        exported_at: new Date().toISOString(),
        tenant_uuid: tenantUuid,
        org_id: orgIdNum,
        tables: exportData,
      });
      const bundleGz = await gzip(Buffer.from(bundleJson, "utf8"));

      const bundleFilename = `export_${tenantUuid}_${Date.now()}.json.gz`;
      const bundlePath = path.join(EXPORT_STAGING_DIR, bundleFilename);
      fs.writeFileSync(bundlePath, bundleGz);

      // ── Generate confirmation token ───────────────────────────────────────
      // Raw token is 32 bytes of cryptographically secure random data.
      // Only the sha256 hash is persisted — the raw token is returned once
      // in this response and cannot be retrieved again.
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // export_delete_tokens' RLS WITH CHECK compares its TEXT tenant-UUID
      // org_id against the GUC — flip context to the tenant UUID for the
      // token INSERT only.
      await setOrgCtx(client, tenantUuid);

      const tokenRes = await client.query(
        `INSERT INTO export_delete_tokens
           (token_hash, org_id, actor_oid, export_path, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [tokenHash, tenantUuid, actorOid, bundlePath, expiresAt],
      );
      const tokenId: bigint = BigInt(tokenRes.rows[0].id);

      // ── Audit writes (fire-and-forget) ───────────────────────────────────
      // Two separate rows: one for the export initiation, one for the token.
      auditWrite({
        actor_oid: actorOid,
        org_id: orgIdNum,
        action: "export.data_export",
        resource_type: "export",
        resource_id: tokenId.toString(),
        detail: {
          export_path: bundlePath,
          tables_exported: Object.keys(exportData),
          row_counts: Object.fromEntries(
            Object.entries(exportData).map(([k, v]) => [k, v.length]),
          ),
        },
        ip_address: req.ip,
      });

      auditWrite({
        actor_oid: actorOid,
        org_id: orgIdNum,
        action: "export.delete_confirm",
        resource_type: "export",
        resource_id: tokenId.toString(),
        detail: {
          export_path: bundlePath,
          expires_at: expiresAt.toISOString(),
        },
        ip_address: req.ip,
      });

      const downloadPath = `/api/admin/export-and-delete/export/${tokenId}`;

      return res.json({
        confirmation_token: rawToken,
        export_path: downloadPath,
        expires_at: expiresAt.toISOString(),
        instructions:
          "Use the confirmation_token in a POST to " +
          "/api/admin/export-and-delete/execute within the expiry window " +
          "to permanently delete this organization's data.",
      });
    } catch (err: any) {
      console.error("[export-delete/request] error:", err);
      return res.status(err.status ?? 500).json({ error: err.message });
    } finally {
      await resetOrgCtx(client);
      client.release();
    }
  },
);

// ── GET /api/admin/export-and-delete/export/:token_id ────────────────────
//
// Download the gzipped export bundle. Admin-only. Validates that the
// token belongs to the requesting Admin's org before serving the file.

exportDeleteRoutes.get(
  "/admin/export-and-delete/export/:token_id",
  async (req: Request, res: Response) => {
    const tenantUuid = reqTenantUuid(req);  // compare against export_delete_tokens.org_id (TEXT)
    const { token_id } = req.params;

    // FAIL-CLOSED gate (ISSUE-013): an unrecognized tenant is refused before
    // any token row is read. The resolved numeric id is not needed for the
    // statements below (token RLS keys on the tenant UUID), but the positive
    // resolution IS the authorization that this tenant exists.
    try {
      await reqOrgId(req);
    } catch (err: any) {
      console.error("[export-delete/download] org resolution refused:", err.message);
      return res.status(err.status ?? 500).json({ error: err.message });
    }

    const client = await pool.connect();
    try {
      // Token RLS compares the TEXT tenant-UUID org_id against the GUC — a
      // bare read returns 0 rows under fail-closed RLS (MT-2).
      await setOrgCtx(client, tenantUuid);

      const tokenRes = await client.query(
        "SELECT export_path, org_id FROM export_delete_tokens WHERE id = $1",
        [token_id],
      );

      if (!tokenRes.rows[0]) {
        return res.status(404).json({ error: "Export not found." });
      }

      const { export_path, org_id: tokenOrgId } = tokenRes.rows[0];

      if (tokenOrgId !== tenantUuid) {
        return res.status(403).json({ error: "Access denied." });
      }

      if (!fs.existsSync(export_path)) {
        return res.status(404).json({ error: "Export file not found on disk." });
      }

      res.setHeader("Content-Type", "application/gzip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="baseline-export-${token_id}.json.gz"`,
      );
      fs.createReadStream(export_path).pipe(res);
    } catch (err: any) {
      console.error("[export-delete/download] error:", err);
      return res.status(err.status ?? 500).json({ error: err.message });
    } finally {
      await resetOrgCtx(client);
      client.release();
    }
  },
);

// ── POST /api/admin/export-and-delete/execute ────────────────────────────
//
// Consumes a confirmation token and hard-deletes all canonical data for
// the org. THIS OPERATION IS IRREVERSIBLE.
//
// Delete sequence (single transaction):
//   a. Hard-delete all canonical rows except audit_log
//   b. Mark the token as consumed (consumed_at = NOW())
//   c. Write export.delete_execute audit entry (within the transaction)
//   d. Delete all audit_log rows for this org — including the row just written
//      (unlocked by SET LOCAL app.export_delete_active = 'true')
//
// After commit, nothing remains in the DB for this org's canonical data.

exportDeleteRoutes.post(
  "/admin/export-and-delete/execute",
  async (req: Request, res: Response) => {
    const actorOid = (req as any).user?.oid ?? "unknown";
    const tenantUuid = reqTenantUuid(req);  // for cross-org check vs export_delete_tokens.org_id (TEXT)

    // FAIL-CLOSED resolution (ISSUE-013): tenant UUID → numeric
    // organizations.id, refused (403) on no match — never a default org. An
    // export-delete for an unrecognized tenant must not touch a single row.
    let orgIdNum: number;
    try {
      orgIdNum = await reqOrgId(req);
    } catch (err: any) {
      console.error("[export-delete/execute] org resolution refused:", err.message);
      return res.status(err.status ?? 500).json({ error: err.message });
    }

    const { confirmation_token } = req.body ?? {};
    if (!confirmation_token || typeof confirmation_token !== "string") {
      return res.status(400).json({ error: "confirmation_token is required." });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(confirmation_token)
      .digest("hex");

    const client = await pool.connect();
    try {
      // ── Token lookup ─────────────────────────────────────────────────────
      // Token RLS keys on the TEXT tenant-UUID org_id (ISSUE-052); under
      // fail-closed RLS the lookup returns 0 rows without this context.
      await setOrgCtx(client, tenantUuid);

      const tokenRes = await client.query(
        `SELECT id, org_id, expires_at, consumed_at
         FROM export_delete_tokens
         WHERE token_hash = $1`,
        [tokenHash],
      );

      if (!tokenRes.rows[0]) {
        return res.status(404).json({ error: "Invalid confirmation token." });
      }

      const tokenRow = tokenRes.rows[0];

      if (new Date(tokenRow.expires_at) < new Date()) {
        return res
          .status(410)
          .json({ error: "Confirmation token has expired." });
      }

      if (tokenRow.consumed_at !== null) {
        return res.status(409).json({
          error: "Confirmation token has already been consumed.",
        });
      }

      // CRITICAL: org_id cross-org check.
      // A token issued for one org must never delete another org's data.
      // tokenRow.org_id is TEXT (the Azure tenant UUID stored at token creation time).
      if (tokenRow.org_id !== tenantUuid) {
        return res.status(403).json({
          error: "Token does not belong to your organization.",
        });
      }

      const orgInt = BigInt(orgIdNum);

      // ── Hard-delete transaction ──────────────────────────────────────────
      // WARNING: This is irreversible. The token consumed_at is set atomically
      // with the delete so partial deletion cannot leave the token re-usable.
      await client.query("BEGIN");
      try {
        const deletionSummary: Record<string, number> = {};

        // Canonical tables + audit_log scope on the NUMERIC org id — flip the
        // context from the tenant UUID (token statements) to the resolved id
        // for the whole delete sequence. Scoping every DELETE below by the
        // RESOLVED org (both in SQL and in RLS) is what guarantees an org-1
        // execute can never touch another org's rows.
        await setOrgCtx(client, String(orgIdNum));

        // STEP a — Delete canonical rows (child tables before parents).

        // stop_effort_history and stop_condition_history have no org_id;
        // scope via visit_id FK.
        const visitIdsRes = await client.query(
          "SELECT id FROM core.visits WHERE org_id = $1",
          [orgInt],
        );
        const visitIds: string[] = visitIdsRes.rows.map((r: any) =>
          String(r.id),
        );

        if (visitIds.length > 0) {
          const sehDel = await client.query(
            "DELETE FROM stop_effort_history WHERE visit_id = ANY($1::bigint[])",
            [visitIds],
          );
          deletionSummary.stop_effort_history = sehDel.rowCount ?? 0;

          const schDel = await client.query(
            "DELETE FROM stop_condition_history WHERE visit_id = ANY($1::bigint[])",
            [visitIds],
          );
          deletionSummary.stop_condition_history = schDel.rowCount ?? 0;
        } else {
          deletionSummary.stop_effort_history = 0;
          deletionSummary.stop_condition_history = 0;
        }

        const eamDel = await client.query(
          "DELETE FROM eam_bridge_route_log WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.eam_bridge_route_log = eamDel.rowCount ?? 0;

        const evDel = await client.query(
          "DELETE FROM core.evidence WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.evidence = evDel.rowCount ?? 0;

        const obsDel = await client.query(
          "DELETE FROM core.observations WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.observations = obsDel.rowCount ?? 0;

        const visitsDel = await client.query(
          "DELETE FROM core.visits WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.visits = visitsDel.rowCount ?? 0;

        const assignDel = await client.query(
          "DELETE FROM core.assignments WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.assignments = assignDel.rowCount ?? 0;

        const locExtDel = await client.query(
          "DELETE FROM core.location_external_ids WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.location_external_ids = locExtDel.rowCount ?? 0;

        const assetLocDel = await client.query(
          "DELETE FROM core.asset_locations WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.asset_locations = assetLocDel.rowCount ?? 0;

        const locDel = await client.query(
          "DELETE FROM core.locations WHERE org_id = $1",
          [orgInt],
        );
        deletionSummary.locations = locDel.rowCount ?? 0;

        // STEP b — Mark token consumed. Token RLS keys on the tenant UUID —
        // flip context for this statement, then back for the audit insert.
        await setOrgCtx(client, tenantUuid);
        await client.query(
          "UPDATE export_delete_tokens SET consumed_at = NOW() WHERE id = $1",
          [tokenRow.id],
        );
        await setOrgCtx(client, String(orgIdNum));

        const executedAt = new Date().toISOString();

        // STEP c — Write the export.delete_execute audit entry using the
        // transaction client. This row is written before the audit_log purge
        // so the deletion is fully documented up to the moment it happens.
        // Phase 3: audit_log.org_id is now bigint — pass orgIdNum (numeric).
        await client.query(
          `INSERT INTO audit_log
             (actor_oid, org_id, action, resource_type, resource_id, detail, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            actorOid,
            orgIdNum,
            "export.delete_execute",
            "export",
            String(tokenRow.id),
            JSON.stringify({
              deletion_summary: deletionSummary,
              executed_at: executedAt,
              note: "Written immediately before audit_log purge. Included in deletion.",
            }),
            req.ip ?? null,
          ],
        );

        // STEP d — Delete all audit_log rows for this org, including the
        // export.delete_execute row just written above.
        // Phase 3: audit_log_delete policy uses bigint comparison.
        // app.export_delete_org_id must be the numeric org_id as a string (e.g. '1').
        await client.query(
          "SELECT set_config('app.export_delete_active', 'true', true)",
        );
        await client.query(
          "SELECT set_config('app.export_delete_org_id', $1, true)",
          [String(orgIdNum)],
        );

        const auditDel = await client.query(
          "DELETE FROM audit_log WHERE org_id = $1",
          [orgIdNum],
        );
        deletionSummary.audit_log = auditDel.rowCount ?? 0;

        await client.query("COMMIT");

        return res.json({
          deleted: true,
          deletion_summary: deletionSummary,
          executed_at: executedAt,
        });
      } catch (txErr) {
        await client.query("ROLLBACK");
        throw txErr;
      }
    } catch (err: any) {
      console.error("[export-delete/execute] error:", err);
      return res.status(err.status ?? 500).json({ error: err.message });
    } finally {
      await resetOrgCtx(client);
      client.release();
    }
  },
);
