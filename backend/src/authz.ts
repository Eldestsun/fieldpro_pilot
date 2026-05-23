import "dotenv/config";
import jwksClient from "jwks-rsa";
import jwt, { JwtHeader, JwtPayload, VerifyErrors } from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { pool, withOrgContext } from "./db";
import { writeAuditLog } from "./middleware/auditLog";

type AuthedRequest = Request & { user?: JwtPayload; roles?: string[] };

/** ===== ENV ===== */
const tenantId = process.env.AZURE_TENANT_ID as string;
const apiAudienceClientId = process.env.AZURE_API_AUDIENCE as string;
if (!tenantId || !apiAudienceClientId) {
  throw new Error("Missing AZURE_TENANT_ID or AZURE_API_AUDIENCE in environment.");
}

const APP_ROLE_ADMIN = process.env.APP_ROLE_ADMIN ?? "Admin";
const APP_ROLE_LEAD = process.env.APP_ROLE_LEAD ?? "Lead";
const APP_ROLE_UL = process.env.APP_ROLE_UL ?? "UL";
// Phase 1 role rename — dual-accept: new role-claim strings issued by Entra
// (Specialist replaces UL, Dispatch replaces Lead). Both old and new strings are
// honored during the migration window. Phase 3 removes the old names.
const APP_ROLE_DISPATCH = "Dispatch";
const APP_ROLE_SPECIALIST = "Specialist";

const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;
const LEAD_GROUP_ID = process.env.LEAD_GROUP_ID;
const UL_GROUP_ID = process.env.UL_GROUP_ID;

/** ===== JWKS CLIENT ===== */
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 60 * 60 * 1000,  // S1-11: 1 hour per sprint spec (was 10 min)
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header: JwtHeader, cb: (err: Error | null, key?: string) => void) {
  if (!header.kid) return cb(new Error("No 'kid' in token header"));
  client.getSigningKey(header.kid)
    .then(k => cb(null, k.getPublicKey()))
    .catch(err => cb(err));
}

/** ===== HELPERS ===== */
function extractRolesFromClaims(payload: JwtPayload): string[] {
  const out = new Set<string>();

  const roles = (payload as any).roles as string[] | undefined;
  if (roles?.length) {
    const accepted = [
      APP_ROLE_ADMIN,
      APP_ROLE_LEAD,
      APP_ROLE_UL,
      APP_ROLE_DISPATCH,
      APP_ROLE_SPECIALIST,
    ];
    for (const r of roles) {
      if (accepted.includes(r)) out.add(r);
    }
  }

  const groups = (payload as any).groups as string[] | undefined;
  if (groups?.length) {
    if (ADMIN_GROUP_ID && groups.includes(ADMIN_GROUP_ID)) out.add(APP_ROLE_ADMIN);
    if (LEAD_GROUP_ID && groups.includes(LEAD_GROUP_ID)) out.add(APP_ROLE_LEAD);
    if (UL_GROUP_ID && groups.includes(UL_GROUP_ID)) out.add(APP_ROLE_UL);
  }

  return Array.from(out);
}

function auditWarn(event: string, details: Record<string, unknown>) {
  console.warn(`[AUTHZ] ${event}`, { ...details, ts: new Date().toISOString() });
}

// Non-blocking identity cache upsert
function upsertIdentity(user: JwtPayload, roles: string[]) {
  // Fire and forget - do not block the request
  (async () => {
    try {
      const oid = user.oid;
      if (!oid) return;

      const displayName = user.name || user.preferred_username || "Unknown";
      const email = user.email || user.preferred_username || null; // fallback to upn if email missing
      const lastSeenRole = roles.length > 0 ? roles[0] : null;
      const tenantUuid = (user as any).tid ?? null;

      // Resolve numeric org_id from tenant UUID so RLS allows the write.
      // Falls back to the first org (by id) for single-tenant pilot deployments
      // where organizations.tenant_uuid is not yet populated.
      const orgRes = await pool.query(
        `SELECT id FROM organizations
         WHERE tenant_uuid = $1
         UNION ALL
         SELECT id FROM organizations
         ORDER BY id
         LIMIT 1`,
        [tenantUuid],
      );
      if (!orgRes.rows[0]) {
        console.warn("[AUTHZ] upsertIdentity: no organization found, skipping");
        return;
      }
      const orgId = orgRes.rows[0].id;

      // identity_directory has FORCE ROW LEVEL SECURITY — the INSERT must run
      // inside withOrgContext so app.current_org_id is set for the session.
      await withOrgContext(orgId, async (client) => {
        await client.query(
          `INSERT INTO identity_directory (oid, org_id, display_name, email, last_seen_role, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (oid) DO UPDATE SET
             display_name   = EXCLUDED.display_name,
             email          = EXCLUDED.email,
             last_seen_role = EXCLUDED.last_seen_role,
             last_seen_at   = EXCLUDED.last_seen_at`,
          [oid, orgId, displayName, email, lastSeenRole],
        );
      });
    } catch (err) {
      // Log only, do not fail
      console.warn("[AUTHZ] Identity upsert failed:", err);
    }
  })();
}

// Non-blocking audit write for auth events. Same fire-and-forget pattern as upsertIdentity.
function writeAuthAudit(action: string, actorOid: string, orgId: string, ipAddress: string | undefined) {
  (async () => {
    try {
      await writeAuditLog({ actor_oid: actorOid, org_id: orgId, action, ip_address: ipAddress });
    } catch (err) {
      console.warn('[AUTHZ] audit write failed:', err);
    }
  })();
}

/** ===== CLAIM VALIDATION ===== */
export function assertClaims(payload: JwtPayload): void {
  // aud — must be one of the configured audience values (jwt.verify already checks this,
  // but we assert explicitly so the shape is testable and the check is auditable)
  const aud = payload.aud;
  const audValues = Array.isArray(aud) ? aud : aud ? [aud] : [];
  const audOk = audValues.some(
    (a) => a === apiAudienceClientId || a === `api://${apiAudienceClientId}`
  );
  if (!audOk) throw new Error("Invalid aud claim");

  // iss — v2.0 only (stricter than jwt.verify, which also accepts sts.windows.net)
  const expectedIss = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (payload.iss !== expectedIss) throw new Error("Invalid iss claim");

  // exp — validated by jwt.verify (clockTolerance: 60, ignoreExpiration not set); no action needed

  // oid — NOT validated by jwt.verify; must be a non-empty string
  const oid = (payload as any).oid;
  if (!oid || typeof oid !== "string") throw new Error("Missing or invalid oid claim");
}

/** ===== MIDDLEWARES ===== */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // DEV_TOKEN_INJECTION: if devAuthBypass already set req.user + req.roles,
  // skip JWT validation. This branch is unreachable in production because
  // devAuthBypass never registers when NODE_ENV==='production'.
  if (req.user) return next();

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    auditWarn("missing_token", { path: req.path, ip: req.ip });
    return res.status(401).json({ error: "missing bearer token" });
  }

  const acceptedAudiences: [string, ...string[]] = [
    apiAudienceClientId,
    `api://${apiAudienceClientId}`,
  ];

  jwt.verify(
    token,
    getKey,
    {
      algorithms: ["RS256"],
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
      audience: acceptedAudiences,
      clockTolerance: 60,
      complete: false,
    },
    (err: VerifyErrors | null, decoded?: jwt.JwtPayload | string) => {
      if (err) {
        auditWarn("invalid_token", { path: req.path, ip: req.ip, err: err.message });
        writeAuthAudit('auth.login_failed', 'unknown', process.env.AZURE_TENANT_ID ?? 'unknown', req.ip);
        return res.status(401).json({ error: "invalid token" });
      }
      const payload = typeof decoded === "string" ? undefined : decoded;
      if (!payload) {
        auditWarn("invalid_payload", { path: req.path, ip: req.ip });
        return res.status(401).json({ error: "invalid token payload" });
      }

      // S1-11: explicit claim validation after JWKS signature check
      try {
        assertClaims(payload as JwtPayload);
      } catch (claimErr: any) {
        auditWarn("invalid_claims", { path: req.path, ip: req.ip, reason: claimErr.message });
        writeAuthAudit("auth.login_failed", "unknown", process.env.AZURE_TENANT_ID ?? "unknown", req.ip);
        return res.status(401).json({ error: "invalid token" });
      }

      req.user = payload as JwtPayload;
      req.roles = extractRolesFromClaims(payload as JwtPayload);

      // Enterprise Identity: Upsert to directory cache (non-blocking)
      upsertIdentity(req.user, req.roles);

      // S1-2: Audit successful authentication (non-blocking)
      writeAuthAudit(
        'auth.login',
        (payload as any).oid ?? 'unknown',
        (payload as any).tid ?? process.env.AZURE_TENANT_ID ?? 'unknown',
        req.ip,
      );

      next();
    }
  );
}

/** Require ANY of the listed roles (Admin bypass allowed) */
export function requireAnyRole(required: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const roles = req.roles ?? [];
    const has = roles.some((r: string) => r === APP_ROLE_ADMIN || required.includes(r));
    if (!has) {
      auditWarn("forbidden", { path: req.path, ip: req.ip, required, got: roles });
      return res.status(403).json({ error: "forbidden" });
    }
    next();
  };
}