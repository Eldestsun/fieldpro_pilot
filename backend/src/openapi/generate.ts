/**
 * OpenAPI 3.0 spec generator for BASELINE.
 *
 * Run:  pnpm run openapi:generate
 *
 * What it does:
 *  1. Scans all route files for @openapi JSDoc blocks (via swagger-jsdoc).
 *  2. Validates the generated spec against the OpenAPI 3.0.3 JSON schema.
 *  3. Checks coverage: every route handler registered in the route files must
 *     appear in the spec.  Missing handlers cause a non-zero exit.
 *  4. Cross-checks any x-audit-action values against AUDIT_KNOWN_ACTIONS.
 *  5. Writes backend/openapi/openapi.json and backend/openapi/openapi.yaml.
 *
 * Failure modes guarded against:
 *  - Silent omission: adding a new route without @openapi → generator FAILS.
 *  - Spec drift: routes documented but never registered are harmless; routes
 *    registered but not documented cause failure.
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const swaggerJsdoc = require('swagger-jsdoc');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OpenAPISchemaValidator = require('openapi-schema-validator').default;
import * as yaml from 'js-yaml';
import { AUDIT_KNOWN_ACTIONS } from '../middleware/auditActions';

// ── Paths ──────────────────────────────────────────────────────────────────

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR   = path.join(BACKEND_ROOT, 'openapi');

// ── Route file configuration ───────────────────────────────────────────────
// mountPrefix: path segment appended to /api when this router is mounted.
// subRouters:  named sub-routers declared inside the file and their mount path
//              relative to the file's own mountPrefix.

interface SubRouter {
  name: string;
  mountPath: string;
}

interface RouteFileConfig {
  file: string;
  mountPrefix: string;
  subRouters?: SubRouter[];
}

const ROUTE_FILES: RouteFileConfig[] = [
  { file: 'src/routes/healthRoutes.ts',                        mountPrefix: '' },
  { file: 'src/modules/work/ulRoutes.ts',                      mountPrefix: '' },
  { file: 'src/modules/routes/routeRunRoutes.ts',              mountPrefix: '' },
  { file: 'src/modules/work/routeRunStopRoutes.ts',            mountPrefix: '' },
  { file: 'src/modules/work/uploadRoutes.ts',                  mountPrefix: '' },
  { file: 'src/routes/devRoutes.ts',                           mountPrefix: '' },
  {
    file: 'src/modules/admin/adminRoutes.ts',
    mountPrefix: '',
    subRouters: [{ name: 'ccRouter', mountPath: '/admin/control-center' }],
  },
  { file: 'src/modules/work/stopRoutes.ts',                    mountPrefix: '' },
  { file: 'src/modules/admin/resourceRoutes.ts',               mountPrefix: '' },
  { file: 'src/modules/ops/opsRoutes.ts',                      mountPrefix: '' },
  { file: 'src/modules/routeOverrides/routeOverrideRoutes.ts', mountPrefix: '/route-overrides' },
  { file: 'src/modules/admin/tenantRoutes.ts',                 mountPrefix: '/admin/tenant' },
];

// ── OpenAPI definition (base) ──────────────────────────────────────────────

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'BASELINE Field Operations Intelligence API',
    version: '1.0.0',
    description: [
      'BASELINE captures operational truth through field visits and derives intelligence from that truth.',
      'Every endpoint documents its required role, request/response shapes, and applicable audit log action.',
      '',
      '**Role hierarchy**: Admin > Lead > UL (Unit Leader / field worker)',
      '**Auth**: Bearer token (Azure Entra JWT) on all non-public endpoints.',
      '**Labor safety**: No endpoint exposes per-worker performance metrics or identifiers',
      'to Lead/UL roles. `captured_by_oid` is encrypted and Admin-access-only.',
    ].join('\n'),
    contact: { name: 'BASELINE Engineering' },
  },
  servers: [
    { url: 'http://localhost:3001/api', description: 'Local development' },
    { url: '/api',                      description: 'Production (relative)' },
  ],
  tags: [
    { name: 'Health',          description: 'Service status and identity endpoints' },
    { name: 'UL',              description: 'Unit Leader (field worker) operations' },
    { name: 'RouteRuns',       description: 'Route run creation and lifecycle (Lead/Admin)' },
    { name: 'RouteRunStops',   description: 'Route stop progression and completion (UL/Lead/Admin)' },
    { name: 'Uploads',         description: 'Pre-signed photo upload URLs' },
    { name: 'Stops',           description: 'Stop attribute management' },
    { name: 'Resources',       description: 'Shared read-only resources (pools, users)' },
    { name: 'Ops',             description: 'Operations read-only dashboards (Lead/Admin)' },
    { name: 'Admin',           description: 'Admin-only management and intelligence endpoints' },
    { name: 'ControlCenter',   description: 'Live dispatch overview (Admin only)' },
    { name: 'RouteOverrides',  description: 'Per-stop route overrides (Lead/Admin)' },
    { name: 'Tenant',          description: 'Tenant onboarding: asset types, observation types, asset seeding (Admin)' },
    { name: 'Dev',             description: 'Development/testing utilities — not for production' },
  ],
  components: {
    securitySchemes: {
      AzureAD: {
        type: 'oauth2',
        description:
          'Azure Active Directory (Entra) OAuth2. Pass the resulting access token as `Authorization: Bearer <token>`.',
        flows: {
          authorizationCode: {
            authorizationUrl:
              'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize',
            tokenUrl:
              'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
            scopes: {
              openid:  'OpenID Connect',
              profile: 'User profile',
              email:   'Email address',
            },
          },
        },
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            description: 'Human-readable error message',
            example: 'Resource not found',
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Request validation failed — missing or invalid field',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'pool_id is required' },
          },
        },
      },
      Unauthorized: {
        description: 'Authentication required or Bearer token is invalid/expired',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Unauthorized' },
          },
        },
      },
      Forbidden: {
        description: 'Caller lacks the required role for this endpoint',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Forbidden' },
          },
        },
      },
      NotFound: {
        description: 'Requested resource does not exist',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Route run not found' },
          },
        },
      },
      Conflict: {
        description: 'State conflict — e.g. stop already completed or skipped',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'ALREADY_COMPLETE' },
          },
        },
      },
      PayloadTooLarge: {
        description: 'File exceeds the maximum allowed upload size (25 MB)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'File exceeds 25 MB limit' },
          },
        },
      },
      InternalError: {
        description: 'Unexpected server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Internal server error' },
          },
        },
      },
    },
  },
};

// ── Route extraction (coverage check) ─────────────────────────────────────

interface RouteHandler {
  method: string; // uppercase HTTP verb
  path: string;   // OpenAPI-format path (colon params converted to {param})
  source: string; // "file:lineNum" for error messages
}

function normalizePath(raw: string): string {
  // /route-runs/:id  →  /route-runs/{id}
  return raw.replace(/:([^/]+)/g, '{$1}');
}

function extractRoutesFromFile(
  filePath: string,
  config: RouteFileConfig,
): RouteHandler[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const routes: RouteHandler[] = [];

  // Map: router variable name → its absolute mount path (without /api prefix)
  const routerMap = new Map<string, string>();

  // Discover all Router() instantiations in the file
  const routerDeclRe = /\bconst\s+(\w+)\s*=\s*Router\s*\(\s*\)/g;
  let rdMatch: RegExpExecArray | null;
  while ((rdMatch = routerDeclRe.exec(content)) !== null) {
    const varName = rdMatch[1];
    const sub = config.subRouters?.find((sr) => sr.name === varName);
    routerMap.set(varName, sub ? sub.mountPath : config.mountPrefix);
  }

  // Scan for .get/.post/.patch/.put/.delete registrations
  // Handles both single-line and multi-line (path on next line) patterns.
  const methodRe =
    /(\w+)\.(get|post|patch|put|delete)\s*\(\s*(['"`])([^'"`\n]+)\3/g;
  let match: RegExpExecArray | null;
  while ((match = methodRe.exec(content)) !== null) {
    const [, varName, method, , routePath] = match;
    if (!routerMap.has(varName)) continue;

    const prefix   = routerMap.get(varName)!;
    const combined = (prefix + routePath).replace(/\/+/g, '/') || '/';
    const lineNum  = content.substring(0, match.index).split('\n').length;

    routes.push({
      method: method.toUpperCase(),
      path:   normalizePath(combined),
      source: `${path.relative(BACKEND_ROOT, filePath)}:${lineNum}`,
    });
  }

  return routes;
}

// ── Coverage check ─────────────────────────────────────────────────────────

function checkCoverage(spec: Record<string, unknown>): void {
  // Build the set of (METHOD PATH) pairs present in the spec
  const specKeys = new Set<string>();
  const specPaths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  for (const [specPath, methods] of Object.entries(specPaths)) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
        specKeys.add(`${method.toUpperCase()} ${specPath}`);
      }
    }
  }

  // Extract every handler registered in the route files
  const missing: string[] = [];
  for (const config of ROUTE_FILES) {
    const filePath = path.join(BACKEND_ROOT, config.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[coverage] File not found, skipping: ${config.file}`);
      continue;
    }
    const handlers = extractRoutesFromFile(filePath, config);
    for (const handler of handlers) {
      const key = `${handler.method} ${handler.path}`;
      if (!specKeys.has(key)) {
        missing.push(`  ${key.padEnd(55)}  (${handler.source})`);
      }
    }
  }

  if (missing.length > 0) {
    process.stderr.write(
      '\n[openapi:generate] FAIL — unannotated route handlers found:\n' +
        missing.join('\n') +
        '\n\nFix: add an @openapi JSDoc block above each handler,' +
        ' then re-run openapi:generate.\n\n',
    );
    process.exit(1);
  }
}

// ── Audit action cross-check ───────────────────────────────────────────────
// x-audit-action values in JSDoc must exist in AUDIT_KNOWN_ACTIONS.

function checkAuditActions(spec: Record<string, unknown>): void {
  const specPaths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const violations: string[] = [];

  for (const [specPath, methods] of Object.entries(specPaths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const op = operation as Record<string, unknown>;
      const action = op['x-audit-action'] as string | undefined;
      if (action && !AUDIT_KNOWN_ACTIONS.has(action)) {
        violations.push(
          `  ${method.toUpperCase()} ${specPath}: x-audit-action "${action}" not in AUDIT_KNOWN_ACTIONS`,
        );
      }
    }
  }

  if (violations.length > 0) {
    process.stderr.write(
      '\n[openapi:generate] FAIL — unknown audit actions referenced in spec:\n' +
        violations.join('\n') +
        '\n\nFix: add the action string to AUDIT_KNOWN_ACTIONS' +
        ' in src/middleware/auditActions.ts\n\n',
    );
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[openapi:generate] Scanning route files...');

  const apis = ROUTE_FILES.map((c) => path.join(BACKEND_ROOT, c.file));

  // 1. Generate spec from JSDoc annotations
  const spec = swaggerJsdoc({ definition, apis }) as Record<string, unknown>;

  const pathCount = Object.keys((spec.paths ?? {}) as object).length;
  if (pathCount === 0) {
    process.stderr.write(
      '[openapi:generate] FAIL — no paths found in generated spec.' +
        ' Are @openapi JSDoc blocks present in the route files?\n',
    );
    process.exit(1);
  }

  // 2. Validate against OpenAPI 3.0.3 JSON schema
  console.log('[openapi:generate] Validating spec schema...');
  const validator = new OpenAPISchemaValidator({ version: 3 });
  const validationResult = validator.validate(spec);
  if (validationResult.errors.length > 0) {
    process.stderr.write(
      '[openapi:generate] FAIL — spec does not satisfy OpenAPI 3.0.3 schema:\n',
    );
    for (const err of validationResult.errors) {
      process.stderr.write(`  ${err.instancePath ?? ''} ${err.message}\n`);
    }
    process.exit(1);
  }
  console.log('[openapi:generate] Schema valid ✓');

  // 3. Coverage check — every registered handler must appear in the spec
  console.log('[openapi:generate] Checking handler coverage...');
  checkCoverage(spec);
  console.log('[openapi:generate] All handlers annotated ✓');

  // 4. Audit action cross-check
  console.log('[openapi:generate] Checking audit actions...');
  checkAuditActions(spec);
  console.log('[openapi:generate] Audit actions verified ✓');

  // 5. Write output files
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const jsonPath = path.join(OUTPUT_DIR, 'openapi.json');
  const yamlPath = path.join(OUTPUT_DIR, 'openapi.yaml');

  fs.writeFileSync(jsonPath, JSON.stringify(spec, null, 2) + '\n');
  fs.writeFileSync(yamlPath, yaml.dump(spec, { indent: 2, lineWidth: 120 }));

  const relJson = path.relative(process.cwd(), jsonPath);
  const relYaml = path.relative(process.cwd(), yamlPath);
  console.log(`[openapi:generate] Written: ${relJson}`);
  console.log(`[openapi:generate] Written: ${relYaml}`);
  console.log(`[openapi:generate] ${pathCount} paths documented. Done.`);
}

main().catch((err: unknown) => {
  process.stderr.write(`[openapi:generate] Fatal: ${String(err)}\n`);
  process.exit(1);
});
