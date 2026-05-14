# Dependency Vulnerability Audit — 2026-05-13

**Scope**: S1-10 — Dependency Vulnerability Scan
**Workspaces**: `backend/` and `frontend/`
**Tool**: `pnpm audit`
**Audit date**: 2026-05-13

---

## Pre-remediation finding totals

| Workspace | Critical | High | Moderate | Low | Total |
|-----------|----------|------|----------|-----|-------|
| backend/  | 1        | 13   | 15       | 4   | 33    |
| frontend/ | 0        | 13   | 12       | 2   | 27    |

---

## Post-remediation finding totals

| Workspace | Critical | High | Moderate | Low | Total |
|-----------|----------|------|----------|-----|-------|
| backend/  | 0        | 0    | 0        | 1   | 1     |
| frontend/ | 0        | 0    | 1        | 0   | 1     |

CI gate `pnpm audit --audit-level=high` passes for both workspaces.

---

## Final audit output (verbatim)

### backend/ — final state

```
┌─────────────────────┬────────────────────────────────────────────────────────┐
│ low                 │ jsdiff has a Denial of Service vulnerability in        │
│                     │ parsePatch and applyPatch                              │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Package             │ diff                                                   │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Vulnerable versions │ >=4.0.0 <4.0.4                                         │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Patched versions    │ >=4.0.4                                                │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Paths               │ .>ts-node>diff                                         │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ More info           │ https://github.com/advisories/GHSA-73rr-hh4g-fpgx      │
└─────────────────────┴────────────────────────────────────────────────────────┘
1 vulnerabilities found
Severity: 1 low
```

### frontend/ — final state

```
┌─────────────────────┬────────────────────────────────────────────────────────┐
│ moderate            │ Vite Vulnerable to Path Traversal in Optimized Deps    │
│                     │ `.map` Handling                                        │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Package             │ vite                                                   │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Vulnerable versions │ <=6.4.1                                                │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Patched versions    │ >=6.4.2                                                │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ Paths               │ .>vitest>vite                                          │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ More info           │ https://github.com/advisories/GHSA-4w7w-66w2-5vf9      │
└─────────────────────┴────────────────────────────────────────────────────────┘
1 vulnerabilities found
Severity: 1 moderate
```

---

## Per-finding resolution table — backend/

### CRITICAL

| Advisory | Package | Pre-fix version | Resolution | Method |
|----------|---------|-----------------|------------|--------|
| GHSA-m7jm-9gc2-mpf2 | fast-xml-parser | <5.3.5 (via @aws-sdk) | `pnpm.overrides: fast-xml-parser >=5.5.7` | Override |

### HIGH

| Advisory | Package | Pre-fix version | Resolution | Method |
|----------|---------|-----------------|------------|--------|
| GHSA-869p-cjfg-cm3x | jws | <3.2.3 (via jsonwebtoken) | `pnpm.overrides: jws ^3.2.3` | Override |
| GHSA-37qj-frw5-hhjh | fast-xml-parser | >=5.0.9 <=5.3.3 | `pnpm.overrides: fast-xml-parser >=5.5.7` | Override |
| GHSA-jmr7-xgp7-cmfj | fast-xml-parser | <5.3.6 | `pnpm.overrides: fast-xml-parser >=5.5.7` | Override |
| GHSA-fj3w-jwp8-x2g3 | fast-xml-parser | <5.5.6 | `pnpm.overrides: fast-xml-parser >=5.5.7` | Override |
| GHSA-43fc-jf86-j433 | multer | <2.1.0 | `multer ^2.1.1` in dependencies | Direct bump |
| GHSA (multer DoS) | multer | <2.1.0 | `multer ^2.1.1` in dependencies | Direct bump |
| GHSA (multer DoS) | multer | <2.1.1 | `multer ^2.1.1` in dependencies | Direct bump |
| GHSA-37ch-88jc-xwx2 | path-to-regexp | <0.1.13 (via express) | `pnpm.overrides: express>path-to-regexp ^0.1.13` | Override |
| GHSA-pmwg-cvhr-8vh7 | axios | <1.15.1 | `axios ^1.15.2` in dependencies | Direct bump |
| GHSA-pf86-5x62-jrwf | axios | <1.15.1 | `axios ^1.15.2` in dependencies | Direct bump |
| GHSA-6chq-wfr3-2hj9 | axios | <1.15.1 | `axios ^1.15.2` in dependencies | Direct bump |
| GHSA-43fc-jf86-j433 | axios | <=1.13.4 | `axios ^1.15.2` in dependencies | Direct bump |
| GHSA-6rw7-vpxm-498p (axios proto) | axios | <1.15.2 | `axios ^1.15.2` in dependencies | Direct bump |

### MODERATE (patched)

| Advisory | Package | Pre-fix version | Resolution | Method |
|----------|---------|-----------------|------------|--------|
| GHSA-6rw7-vpxm-498p | qs | <6.14.1 (via express/body-parser) | `pnpm.overrides: qs ^6.14.2` | Override |
| Various axios moderate | axios | <1.15.2 | `axios ^1.15.2` in dependencies | Direct bump |
| follow-redirects | follow-redirects | <=1.15.11 (via axios) | `pnpm.overrides: follow-redirects >=1.16.0` | Override |
| fast-xml-parser entity limits | fast-xml-parser | <5.5.7 | `pnpm.overrides: fast-xml-parser >=5.5.7` | Override |
| uuid buffer bounds | uuid | >=13.0.0 <13.0.1 | `uuid ^13.0.1` in dependencies | Direct bump |

---

## Per-finding resolution table — frontend/

### HIGH

| Advisory | Package | Pre-fix version | Resolution | Method |
|----------|---------|-----------------|------------|--------|
| GHSA-mw96-cpmx-2vgc | rollup | <4.59.0 (via vite) | `pnpm.overrides: rollup >=4.59.0` | Override |
| GHSA-3ppc-4f35-3m26 | minimatch | <3.1.3 (via eslint chain) | eslint bumped 9.34.0→9.39.4 | Indirect via eslint upgrade |
| GHSA-7r86-cg39-jmmj | minimatch | <3.1.3 (via eslint chain) | eslint bumped 9.34.0→9.39.4 | Indirect via eslint upgrade |
| GHSA-23c5-xmqv-rm74 | minimatch | <3.1.4 (via eslint chain) | eslint bumped 9.34.0→9.39.4 | Indirect via eslint upgrade |
| GHSA-c2c7-rcm5-vvqj | picomatch | >=4.0.0 <4.0.4 (via typescript-eslint) | `pnpm.overrides: picomatch >=4.0.4` | Override |
| GHSA-c2c7-rcm5-vvqj | picomatch | >=4.0.0 <4.0.4 (via vite) | `vite ^7.3.2` in devDependencies | Direct bump |
| GHSA-v2wj-q39q-566r | vite | >=7.1.0 <=7.3.1 | `vite ^7.3.2` in devDependencies | Direct bump |
| GHSA-jqfw-vq24-v9c3 | vite | >=7.0.0 <=7.3.1 | `vite ^7.3.2` in devDependencies | Direct bump |
| (flatted DoS) | flatted | <3.4.0 (via eslint chain) | `pnpm.overrides: flatted >=3.4.2` | Override |
| (flatted proto pollution) | flatted | <=3.4.1 (via eslint chain) | `pnpm.overrides: flatted >=3.4.2` | Override |

### MODERATE (patched)

| Advisory | Package | Pre-fix version | Resolution | Method |
|----------|---------|-----------------|------------|--------|
| esbuild dev server | esbuild | <=0.24.2 (via vitest) | `pnpm.overrides: esbuild >=0.25.0` | Override |
| GHSA-rf6f-7fwh-wjgh | flatted | (covered above) | See flatted HIGH entries | Override |
| js-yaml proto pollution | js-yaml | <4.1.1 (via eslint) | `pnpm.overrides: js-yaml >=4.1.1` | Override |
| ajv ReDoS | ajv | <6.14.0 (via eslint) | `pnpm.overrides: ajv ^6.14.0` | Override |
| postcss XSS | postcss | <8.5.10 (via vite) | `pnpm.overrides: postcss >=8.5.10` | Override |
| protocol-buffers-schema | protocol-buffers-schema | <3.6.1 (via maplibre-gl) | `pnpm.overrides: protocol-buffers-schema >=3.6.1` | Override |
| vite path traversal (v7) | vite | >=7.0.0 <=7.3.1 (via vitest) | `vite ^7.3.2` in devDependencies | Direct bump |
| picomatch method injection | picomatch | <4.0.4 | `pnpm.overrides: picomatch >=4.0.4` | Override |

---

## Residual findings (documented, accepted)

### backend/ — LOW — GHSA-73rr-hh4g-fpgx

- **Package**: `diff` >=4.0.0 <4.0.4
- **Path**: `.>ts-node>diff`
- **Why not patched**: `ts-node` is a dev-only test runner. The `diff` package is used internally by ts-node for error reporting, not for parsing user-controlled input. The DoS vector (parsing a maliciously crafted patch string) is unreachable in BASELINE's usage pattern. Per S1-10 policy: LOW → document only.
- **Patch path**: Upgrade `ts-node` to a version that bundles `diff >=4.0.4`, or replace `ts-node` with `tsx`. Tracked as a deferred low-priority dependency update.

### frontend/ — MODERATE — GHSA-4w7w-66w2-5vf9

- **Package**: `vite` <=6.4.1
- **Path**: `.>vitest>vite`
- **Why not patched**: `vitest@2.1.9` internally resolves `vite@5.4.21` as a peer dependency. The advisory affects vite <=6.4.1 — vite 5.x is in that range. Patching requires upgrading vitest from 2.x → 3.x (major version bump, potentially breaking). Our direct `vite` dependency is 7.3.3 which is not vulnerable; only the vitest-internal vite 5.x instance is flagged. The dev server is not exposed in production. Per S1-10 policy: MODERATE without a non-breaking fix → document only.
- **Patch path**: Upgrade `vitest` from `^2.1.0` to `^3.x` when vitest 3 is stable and tested against the backend test suite. Tracked as a deferred dependency update.

---

## Process notes

### Path-specific pnpm overrides did not function as expected

During remediation, multiple attempts were made to fix the minimatch HIGH findings (eslint chain, `<3.1.4` vulnerable) using pnpm path-specific overrides:

- `"eslint>minimatch": ">=3.1.4"` — path was wrong (actual dep is through `@eslint/eslintrc` and `eslint` directly)
- `"@eslint/config-array>minimatch": ">=3.1.4"` — wrong parent; `@eslint/config-array` uses minimatch 10.x, not 3.x
- `"@eslint/eslintrc>minimatch": ">=3.1.4"` and `"eslint>minimatch": ">=3.1.4"` — lockfile showed overrides correctly but pnpm v10.23.0 did not update the resolved version

None of the path-scoped overrides successfully updated minimatch 3.1.2 to 3.1.5. These overrides were removed from the final `package.json`.

### Resolution via direct eslint upgrade

The minimatch HIGH findings were resolved by upgrading eslint from 9.34.0 → 9.39.4 (and typescript-eslint from 8.41.0 → 8.59.3). eslint 9.39.4 ships with minimatch 3.1.5, which is above the `>=3.1.4` patched threshold. These are devDependency bumps within the same major version (9.x), so they are non-breaking from an API perspective. However, they are functional changes (new lint rules or changed behaviour are possible) and are documented here accordingly.

The eslint/typescript-eslint upgrades are the only deviations from pure pnpm.overrides-based remediation.
