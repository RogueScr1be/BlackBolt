# SOS Standalone Package Source

This directory defines the standalone SOS delivery footprint used to generate Leah's handoff bundle.

## Goals
- Keep SOS runtime and secrets independent from BlackBolt shared production.
- Provide one installable package with forms, runbooks, env templates, smoke checks, and monitoring scripts.
- Support end-to-end workflow: intake -> webhook -> orchestration -> SOAP/pedi -> follow-up/fax -> 30/60-day sweep.

## Build Bundle
From repo root:

```bash
npm run sos:bundle:leah
```

Output is generated under `dist/sos-standalone/`.

## Bundle Contents
- `forms/` canonical templates and mappings
- `runbooks/` deployment, setup, troubleshooting, rollback
- `scripts/` preflight, smoke, monitoring checks
- `env/` API/worker env templates
- `checklists/` first-run and go-live validation
