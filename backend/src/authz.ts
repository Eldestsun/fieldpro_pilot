import "dotenv/config";
import jwksClient from "jwks-rsa";
import jwt, { JwtHeader, JwtPayload, VerifyErrors } from "jsonwebtoken";
import { NextFunction, Request, Response } from "express";
import { pool } from "./db";

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

const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;
const LEAD_GROUP_ID = process.env.LEAD_GROUP_ID;
const UL_GROUP_ID = process.env.UL_GROUP_ID;

/** ===== JWKS CLIENT ===== */
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000,
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
    for (const r of roles) {
      if ([APP_ROLE_ADMIN, APP_ROLE_LEAD, APP_ROLE_UL].includes(r)) out.add(r);
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

      const query = `
        INSERT INTO identity_directory (oid, display_name, email, last_seen_role, last_seen_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (oid) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          email = EXCLUDED.email,
          last_seen_role = EXCLUDED.last_seen_role,
          last_seen_at = EXCLUDED.last_seen_at
      `;
      await pool.query(query, [oid, displayName, email, lastSeenRole]);
    } catch (err) {
      // Log only, do not fail
      console.warn("[AUTHZ] Identity upsert failed:", err);
    }
  })();
}

/** ===== MIDDLEWARES ===== */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
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
        return res.status(401).json({ error: "invalid token" });
      }
      const payload = typeof decoded === "string" ? undefined : decoded;
      if (!payload) {
        auditWarn("invalid_payload", { path: req.path, ip: req.ip });
        return res.status(401).json({ error: "invalid token payload" });
      }
      req.user = payload as JwtPayload;
      req.roles = extractRolesFromClaims(payload as JwtPayload);

      // Enterprise Identity: Upsert to directory cache (non-blocking)
      upsertIdentity(req.user, req.roles);

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