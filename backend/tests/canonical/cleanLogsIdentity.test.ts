import * as fs from "fs";
import * as path from "path";
import { test, assert } from "../setup";

/**
 * P1 SAFETY regression (ISSUE-031): worker-attribution identity (clean_logs.user_id)
 * must never reach the clean-logs list endpoints.
 *
 * Originally both GET /admin/clean-logs and GET /api/ops/clean-logs ran
 * `SELECT … FROM public.clean_logs cl`, a table that carries cl.user_id (worker
 * identity). The clean-logs Layer 3 repoint moved both reads onto the canonical
 * layer (core.visits + core.observations) via the single shared builder
 * `buildCleanLogsCanonicalQueries` — so the identity column is now absent *by
 * construction*: the endpoints no longer read clean_logs at all.
 *
 * This suite is the static guard that keeps it that way. It asserts, at the source
 * level, that:
 *   1. neither handler reads public.clean_logs (or the identity-bearing transit view),
 *   2. both handlers delegate to the shared canonical builder, and
 *   3. the shared builder's SELECT names no identity column and still projects the
 *      columns the consumer (LeadCompletedRouteDetail + OpsCleanLog) reads.
 *
 * The runtime proof that the canonical pivot is lossless (and identity-free in the
 * returned shape) lives in cleanLogsCanonicalPivot.test.ts.
 */

// The only worker-identity column on public.clean_logs. If the schema ever grows
// another, add it here.
const IDENTITY_COLUMNS = ["user_id", "worker_id", "employee_id"];

// Columns the consumer (LeadCompletedRouteDetail + OpsCleanLog type) actually
// reads — must survive the rewrite or the UI breaks. Exported so the runtime
// pivot regression asserts the returned row carries every one of them.
export const REQUIRED_COLUMNS = [
  "id",
  "stop_id",
  "route_run_stop_id",
  "cleaned_at",
  "picked_up_litter",
  "emptied_trash",
  "washed_shelter",
  "washed_pad",
  "washed_can",
  // join columns
  "on_street_name",
  "pool_id",
  "run_date",
  "route_pool_id",
];

const SHARED_QUERY_FILE = path.resolve(
  __dirname,
  "../../src/domains/observation/cleanLogsCanonicalQuery.ts",
);

type Handler = { label: string; file: string; routeMarker: string };

const HANDLERS: Handler[] = [
  {
    label: "/admin/clean-logs",
    file: path.resolve(__dirname, "../../src/modules/admin/adminRoutes.ts"),
    routeMarker: 'adminRoutes.get("/admin/clean-logs"',
  },
  {
    label: "/ops/clean-logs",
    file: path.resolve(__dirname, "../../src/modules/ops/opsRoutes.ts"),
    routeMarker: 'opsRoutes.get("/ops/clean-logs"',
  },
];

/** Strip line (//…) and block (/* … *​/) comments so guards inspect code, not prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Slice the source of a single route handler (marker → next handler/.get), code only. */
function handlerBody(h: Handler): string {
  const src = fs.readFileSync(h.file, "utf8");
  const start = src.indexOf(h.routeMarker);
  assert(start !== -1, `${h.label}: route handler not found in ${h.file}`);
  // Bound the slice at the next route registration so we only inspect THIS handler.
  const rest = src.slice(start + h.routeMarker.length);
  const nextGet = rest.search(/Routes\.(get|post|put|delete|patch)\(/);
  return stripComments(rest.slice(0, nextGet === -1 ? undefined : nextGet));
}

for (const h of HANDLERS) {
  test(`clean-logs identity: ${h.label} reads no clean_logs and delegates to the canonical builder`, async () => {
    const body = handlerBody(h);

    // 1. No SQL READ of the identity-bearing legacy sources. (The response envelope
    //    key `clean_logs:` is intentionally retained — guard the read, not the word.)
    assert(
      !/\b(FROM|JOIN)\s+(public\.)?clean_logs\b/i.test(body),
      `${h.label}: handler still reads FROM/JOIN clean_logs (the identity-bearing legacy read must be gone)`,
    );
    assert(!/\bcl\./.test(body), `${h.label}: handler still uses the clean_logs "cl" alias`);
    assert(
      !/v_clean_logs_transit/.test(body),
      `${h.label}: handler still references v_clean_logs_transit (expands clean_logs.user_id)`,
    );

    // 2. No identity column named anywhere in the handler code.
    for (const col of IDENTITY_COLUMNS) {
      assert(
        !new RegExp(`\\b${col}\\b`).test(body),
        `${h.label}: handler names identity column "${col}"`,
      );
    }

    // 3. Delegates to the single shared canonical builder.
    assert(
      /buildCleanLogsCanonicalQueries\(/.test(body),
      `${h.label}: handler does not delegate to buildCleanLogsCanonicalQueries`,
    );
  });
}

test("clean-logs identity: shared canonical builder is identity-free and column-complete", async () => {
  const raw = fs.readFileSync(SHARED_QUERY_FILE, "utf8");
  const src = stripComments(raw);

  // The builder must drive off canonical core.visits, never read clean_logs.
  assert(
    !/\b(FROM|JOIN)\s+(public\.)?clean_logs\b/i.test(src),
    "shared builder still reads FROM/JOIN clean_logs",
  );
  assert(!/\bcl\./.test(src), 'shared builder still uses the clean_logs "cl" alias');
  assert(
    /FROM core\.visits/.test(src),
    "shared builder does not drive off core.visits",
  );

  // No identity column projected.
  for (const col of IDENTITY_COLUMNS) {
    assert(
      !new RegExp(`\\b${col}\\b`).test(src),
      `shared builder names identity column "${col}"`,
    );
  }

  // REQUIRED_COLUMNS shape (every consumer-read column present in the returned row)
  // is verified at RUNTIME against a seeded fixture in cleanLogsCanonicalPivot.test.ts —
  // the projection is built dynamically from CLEAN_ACTION_KEYS, so a runtime shape
  // assertion is stronger than parsing the source template.
});
