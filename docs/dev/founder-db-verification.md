# Founder DB Verification — independent SQL access to the dev database

> **Purpose:** "Surfaces, never silently concludes — the human is always the verifier."
> This is your direct line into the database so agent claims ("it wrote the visit")
> are checkable without trusting the agent. DEV ONLY — the hosted/shadow environment
> gets founder access through the hosting provider's console instead, never an
> exposed web SQL tool.

---

## 1. Access

### Browser (works from your phone on home WiFi — mid-Prompt3 verification)

- **URL:** `http://<mac-lan-ip>:8081` (find the IP with `ipconfig getifaddr en0`;
  e.g. `http://10.0.0.157:8081`). Same URL works on the Mac as `http://localhost:8081`.
- **Login form:** System `PostgreSQL` · Server `postgres` · Database `fieldpro_db`
  · Username/password: see §2. Nothing is auto-authenticated — the console is only
  as open as the credential you type.
- Runs as the `adminer` service in `docker-compose.yml`
  (`docker compose up -d adminer` if it isn't running).

### Desktop terminal

```bash
# verifier view (see §2 for which user to pick)
psql -h localhost -p 5432 -U fieldpro_admin -d fieldpro_db
```

**Port gotcha (PG-PORT-COLLISION):** a Homebrew Postgres also listens on
localhost:5432 and answers first for some tools. If you get `role "fieldpro" does
not exist`, you hit the wrong server — connect to the Mac's LAN IP instead
(`-h 10.0.0.157`), which always reaches the Docker DB.

### GUI apps (TablePlus / DBeaver / pgAdmin)

Host `localhost` (or the LAN IP per the gotcha) · Port `5432` · Database
`fieldpro_db` · user/password per §2.

## 2. Which credential to use

Passwords are NOT in this file — they live in gitignored `backend/.env`.

| User | Password key (backend/.env) | What you see | Use it for |
|---|---|---|---|
| `fieldpro_admin` | `FIELDPRO_ADMIN_PASSWORD` | **Everything** — BYPASSRLS, so no org-context friction | **Verification (recommended).** It can also write/DDL — stick to SELECTs. |
| `fieldpro` | (compose default) | The app's own view — RLS-filtered, so tables look **empty** until you run `SELECT set_config('app.current_org_id','1',false);` first | Reproducing exactly what the app can see (PATTERN-001 debugging) |

## 3. Verification query pack

Paste-ready. Each answers one "did it really happen" question. As `fieldpro_admin`
these work directly; as `fieldpro`, run the `set_config` line above first.

**Q1 — What has the system written in the last hour? (the pulse)**
```sql
SELECT 'visits' AS what, COUNT(*) FROM core.visits        WHERE started_at  > NOW() - INTERVAL '1 hour'
UNION ALL SELECT 'observations', COUNT(*) FROM core.observations WHERE observed_at > NOW() - INTERVAL '1 hour'
UNION ALL SELECT 'evidence',     COUNT(*) FROM core.evidence     WHERE created_at  > NOW() - INTERVAL '1 hour'
UNION ALL SELECT 'assignments',  COUNT(*) FROM core.assignments  WHERE created_at  > NOW() - INTERVAL '1 hour'
UNION ALL SELECT 'audit_log',    COUNT(*) FROM audit_log         WHERE occurred_at > NOW() - INTERVAL '1 hour';
```

**Q2 — Latest field activity, stop by stop (what a completion actually wrote)**
```sql
SELECT v.id AS visit_id, lei.external_id AS stop_id, v.outcome,
       v.started_at, v.ended_at,
       string_agg(o.intervention, ', ' ORDER BY o.intervention)
         FILTER (WHERE o.obs_kind = 'action') AS actions
FROM core.visits v
LEFT JOIN core.location_external_ids lei ON lei.location_id = v.location_id
LEFT JOIN core.observations o ON o.visit_id = v.id
GROUP BY v.id, lei.external_id, v.outcome, v.started_at, v.ended_at
ORDER BY v.started_at DESC LIMIT 10;
```

**Q3 — Labor-safety spot check: identity is encrypted at rest, everywhere**
```sql
SELECT 'visit' AS sidecar,      COUNT(*) FILTER (WHERE actor_ref <> 'encrypted') AS plaintext, COUNT(*) AS total FROM core.visit_actor_audit
UNION ALL SELECT 'observation', COUNT(*) FILTER (WHERE actor_ref <> 'encrypted'), COUNT(*) FROM core.observation_actor_audit
UNION ALL SELECT 'evidence',    COUNT(*) FILTER (WHERE actor_ref <> 'encrypted'), COUNT(*) FROM core.evidence_actor_audit
UNION ALL SELECT 'assignment',  COUNT(*) FILTER (WHERE actor_ref <> 'encrypted'), COUNT(*) FROM core.assignment_actor_audit;
-- plaintext must be 0 on every row
```

**Q4 — Run/stop status board (does the UI match the DB?)**
```sql
SELECT rr.id AS run, rr.run_date, rr.status AS run_status,
       COUNT(*) FILTER (WHERE rrs.status = 'done')    AS stops_done,
       COUNT(*) FILTER (WHERE rrs.status = 'pending') AS stops_pending,
       COUNT(*) AS stops_total
FROM route_runs rr JOIN route_run_stops rrs ON rrs.route_run_id = rr.id
GROUP BY rr.id, rr.run_date, rr.status
ORDER BY rr.id DESC LIMIT 10;
```

**Q5 — Audit trail tail (who did what through the API, incl. dev-bypass use)**
```sql
SELECT occurred_at, action, actor_oid, ip_address
FROM audit_log ORDER BY occurred_at DESC LIMIT 20;
```

**Q6 — Migration ledger tail (is the schema at the version the agent claims?)**
```sql
SELECT filename, applied_at FROM public.schema_migrations
ORDER BY applied_at DESC LIMIT 10;
```

**Q7 — Completeness cross-check (every done stop should have a canonical visit)**
```sql
-- Rows returned = completed stops with NO canonical visit = the AGENT-SMOKE-1
-- finding class. Empty result = canonical layer is keeping up with the adapter.
SELECT rrs.id AS route_run_stop_id, rrs.stop_id, rrs.completed_at
FROM route_run_stops rrs
WHERE rrs.status = 'done'
  AND NOT EXISTS (
    SELECT 1 FROM core.visits v
    JOIN core.location_external_ids lei ON lei.location_id = v.location_id
    WHERE lei.external_id = rrs.stop_id
      AND v.started_at::date = COALESCE(rrs.completed_at::date, CURRENT_DATE))
ORDER BY rrs.completed_at DESC NULLS LAST LIMIT 20;
```

## 4. Boundaries

- This console and the `fieldpro_admin` credential are **dev-machine only**. The
  shadow/hosted environment (SHADOW-ENV) gets founder access via the provider's
  own console — an internet-reachable web SQL tool never ships.
- The verification habit to keep: after any agent claims a write, run Q1/Q2 and
  see it yourself. Disagreement between agent claim and query result is always
  worth a dispatch.
