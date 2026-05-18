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

// Resolve bigint org_id from the organizations table.
//
// PILOT LIMITATION: This system has a single organization (KCM). In a
// multi-org deployment, populate organizations.tenant_uuid with the Azure
// Tenant UUID so this lookup can be scoped precisely. Until then, the first
// org is used, which is correct for the single-tenant pilot.
async function resolveOrgInt(tenantUuid: string, client: any): Promise<bigint> {
  const res = await client.query(
    `SELECT id FROM organizations
     WHERE tenant_uuid = $1
     UNION ALL
     SELECT id FROM organizations
     ORDER BY id
     LIMIT 1`,
    [tenantUuid],
  );
  if (!res.rows[0]) throw new Error("No organization found for this tenant.");
  return BigInt(res.rows[0].id);
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
    const orgIdNum = await reqOrgId(req);   // numeric organizations.id for data + audit queries
    const orgInt = BigInt(orgIdNum);

    const client = await pool.connect();
    try {
      ensureStagingDir();

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

      // core.assignments
      const assignRes = await client.query(
        "SELECT * FROM core.assignments WHERE org_id = $1",
        [orgInt],
      );
      exportData.assignments = assignRes.rows;

      // core.visits — include both plaintext and KMS-ciphertext OID fields (S1-13 dual-write)
      const visitsRes = await client.query(
        "SELECT * FROM core.visits WHERE org_id = $1",
        [orgInt],
      );
      exportData.visits = visitsRes.rows;
      const visitIds: bigint[] = visitsRes.rows.map((r: any) => BigInt(r.id));

      // core.observations
      const obsRes = await client.query(
        "SELECT * FROM core.observations WHERE org_id = $1",
        [orgInt],
      );
      exportData.observations = obsRes.rows;

      // core.evidence (metadata only — storage_key references blobs, blobs not included)
      const evRes = await client.query(
        "SELECT * FROM core.evidence WHERE org_id = $1",
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
      return res.status(500).json({ error: err.message });
    } finally {
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

    try {
      const tokenRes = await pool.query(
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
      return res.status(500).json({ error: err.message });
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
    const orgIdNum = await reqOrgId(req);   // numeric, for audit + data ops

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

        // STEP b — Mark token consumed.
        await client.query(
          "UPDATE export_delete_tokens SET consumed_at = NOW() WHERE id = $1",
          [tokenRow.id],
        );

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
      return res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  },
);
