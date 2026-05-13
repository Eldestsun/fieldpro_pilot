// Verify R11 multi-tenant hardening
// Run: npx ts-node scripts/verify_r11.ts

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function verify() {
  const client = await pool.connect()
  const results: { test: string; pass: boolean; detail: string }[] = []

  try {
    // Test 1: identity_directory has org_id column
    const col = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'identity_directory' AND column_name = 'org_id'
    `)
    results.push({
      test: 'identity_directory has org_id',
      pass: col.rows.length === 1,
      detail: col.rows.length === 1 ? 'column exists' : 'MISSING'
    })

    // Test 2: identity_directory has RLS policy
    const rls = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'identity_directory' AND policyname = 'org_isolation'
    `)
    results.push({
      test: 'identity_directory has org_isolation policy',
      pass: rls.rows.length === 1,
      detail: rls.rows.length === 1 ? 'policy exists' : 'MISSING'
    })

    // Test 3: identity_directory cross-tenant isolation
    await client.query(`SET app.current_org_id = 999`)
    const crossTenant = await client.query(
      `SELECT count(*) FROM public.identity_directory`
    )
    results.push({
      test: 'identity_directory returns 0 rows for unknown org',
      pass: parseInt(crossTenant.rows[0].count) === 0,
      detail: `returned ${crossTenant.rows[0].count} rows`
    })

    // Test 4: core.asset_locations has RLS
    const alRls = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'asset_locations' AND schemaname = 'core'
    `)
    results.push({
      test: 'core.asset_locations has RLS policy',
      pass: alRls.rows.length > 0,
      detail: alRls.rows.length > 0 ? 'policy exists' : 'MISSING'
    })

    // Test 5: route_runs.org_id is NOT NULL
    const rrNull = await client.query(`
      SELECT count(*) FROM public.route_runs WHERE org_id IS NULL
    `)
    results.push({
      test: 'route_runs has no NULL org_id rows',
      pass: parseInt(rrNull.rows[0].count) === 0,
      detail: `${rrNull.rows[0].count} NULL rows`
    })

    // Test 6: no user_id on intelligence tables
    const labourSafety = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE column_name = 'user_id'
        AND table_name IN (
          'stop_effort_history','stop_condition_history',
          'stop_risk_snapshot','stop_risk_scores'
        )
    `)
    results.push({
      test: 'intelligence tables have no user_id column',
      pass: labourSafety.rows.length === 0,
      detail: labourSafety.rows.length === 0
        ? 'clean'
        : `FOUND on: ${labourSafety.rows.map((r: any) => r.table_name).join(', ')}`
    })

  } finally {
    client.release()
    await pool.end()
  }

  console.log('\nR11 Verification Results\n' + '─'.repeat(50))
  let allPass = true
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌'
    console.log(`${icon} ${r.test} — ${r.detail}`)
    if (!r.pass) allPass = false
  }
  console.log('─'.repeat(50))
  console.log(allPass ? '\nAll assertions PASS' : '\nFAILURES detected — see above')
  process.exit(allPass ? 0 : 1)
}

verify().catch(console.error)
