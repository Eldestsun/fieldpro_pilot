#!/usr/bin/env python3
"""Severity gate over an osv-scanner JSON report.

CI dependency gate (S1-10): FAIL only on HIGH or CRITICAL advisories; LOW and
MODERATE are informational and do not block (per
docs/security/dependency-audit-2026-05-13.md).

Context: this replaced `pnpm audit --audit-level=high`, which broke repo-wide when
npm retired the legacy audit endpoint pnpm calls (HTTP 410 — "use the bulk advisory
endpoint"). osv-scanner reads the lockfiles against the OSV database with no
dependency on npm's audit endpoint, but its own exit code fails on ANY vulnerability
(Low/Medium included). This script re-imposes the exact HIGH/CRITICAL-only policy on
top of osv-scanner's JSON so the gate's posture is unchanged.

Usage: osv-severity-gate.py <osv-report.json>
Exit 0 = clean or only Low/Medium; exit 1 = at least one High/Critical; exit 2 = bad input.

A finding is HIGH/CRITICAL when either signal says so:
  - group max_severity (CVSS base score) >= 7.0   (High 7.0-8.9, Critical 9.0-10)
  - database_specific.severity in {HIGH, CRITICAL} (the GHSA severity string)
Both are checked so a missing CVSS score can't silently downgrade a GHSA-High.
"""
import json
import sys

BLOCK_STRINGS = {"HIGH", "CRITICAL"}
CVSS_HIGH_FLOOR = 7.0


def load(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except FileNotFoundError:
        # No report file → osv-scanner never produced output (e.g. it errored
        # before writing). Fail loudly rather than pass a silent empty gate.
        print(f"osv-severity-gate: report not found: {path}", file=sys.stderr)
        sys.exit(2)
    except json.JSONDecodeError as e:
        print(f"osv-severity-gate: malformed report {path}: {e}", file=sys.stderr)
        sys.exit(2)


def group_max_cvss(pkg):
    best = 0.0
    for g in pkg.get("groups", []) or []:
        ms = g.get("max_severity")
        try:
            best = max(best, float(ms))
        except (TypeError, ValueError):
            continue
    return best


def main():
    if len(sys.argv) != 2:
        print("usage: osv-severity-gate.py <osv-report.json>", file=sys.stderr)
        sys.exit(2)

    data = load(sys.argv[1])
    blocking, informational = [], []

    for result in data.get("results", []):
        src = result.get("source", {}).get("path", "?")
        for pkg in result.get("packages", []):
            name = pkg.get("package", {}).get("name", "?")
            cvss = group_max_cvss(pkg)
            for vuln in pkg.get("vulnerabilities", []):
                sev = ((vuln.get("database_specific") or {}).get("severity") or "").upper()
                is_high = sev in BLOCK_STRINGS or cvss >= CVSS_HIGH_FLOOR
                line = f"{name} {vuln.get('id')} severity={sev or 'n/a'} cvss={cvss} [{src}]"
                (blocking if is_high else informational).append(line)

    if informational:
        print(f"Informational (Low/Medium — not blocking): {len(informational)}")
        for line in informational:
            print(f"  - {line}")

    if blocking:
        print(f"\nBLOCKING — HIGH/CRITICAL advisories: {len(blocking)}")
        for line in blocking:
            print(f"  ✗ {line}")
        print("\nDependency gate FAILED (S1-10: High/Critical must be clean).")
        sys.exit(1)

    print("\nDependency gate PASSED — no High/Critical advisories.")
    sys.exit(0)


if __name__ == "__main__":
    main()
