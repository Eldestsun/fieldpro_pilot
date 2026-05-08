# planning/specs — Context

Spec files are analysis artifacts: diagnosis, audit, and planning notes.
They record *what was found or decided* and are never code.

## Subfolder Map

| Folder | Scope |
|---|---|
| `auth/` | Authentication and token flow — MSAL, frontend auth, silent token diagnostics |
| `infra/` | Deployment, environment config, dev-to-prod gaps, API routing |
| `domain-model/` | Canonical data model audits — visits, observations, evidence, assignments |

## Conventions

- One `.md` file per topic or investigation thread.
- File names use `kebab-case` and are descriptive.
- Analysis tasks: create or update a file here. Do **not** write code.
- New folders should map to a distinct aspect of the app or build (auth, infra, domain-model, offline, intelligence, etc.).
- When a folder grows beyond ~6 files, consider splitting into sub-topics.
