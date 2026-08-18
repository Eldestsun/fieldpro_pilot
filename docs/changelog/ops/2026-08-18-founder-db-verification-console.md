# 2026-08-18 — Founder DB verification console + query pack

## What changed
- `docker-compose.yml`: new `adminer` service (dev-only browser SQL console,
  :8081) so the founder can independently verify DB state — including from a
  phone on the home LAN during mobile agent sessions. Credentialed login only;
  header comment marks it NEVER-in-hosted-compose.
- `docs/dev/founder-db-verification.md`: connection recipes (browser/psql/GUI,
  incl. the PG-PORT-COLLISION gotcha and which credential sees what:
  fieldpro_admin = verifier/BYPASSRLS, fieldpro = app view under RLS) + a
  seven-query verification pack (activity pulse, per-stop write detail,
  sidecar-encryption spot check, status board, audit tail, migration ledger,
  done-stop↔canonical-visit completeness cross-check).

## Why
- Founder requirement (2026-08-18): direct SQL access to verify the system is
  writing — "the human is always the verifier"; agent claims must be checkable
  without trusting the agent. Q7 exists specifically to catch the
  AGENT-SMOKE-1 finding class.

## Files touched
- docker-compose.yml
- docs/dev/founder-db-verification.md (new)
- docs/changelog/ops/2026-08-18-founder-db-verification-console.md (this file)
