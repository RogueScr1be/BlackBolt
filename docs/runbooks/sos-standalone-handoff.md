# SOS Standalone Handoff Package Guide

## Output Artifact
Run:
```bash
npm run sos:bundle:leah
```

Latest output:
- `dist/sos-standalone/SOS_Leah_<timestamp>/`
- `dist/sos-standalone/SOS_Leah_<timestamp>.zip`

## What to Send Leah
Send the generated zip via email or Google Drive.

## Leah Install Flow
1. Unzip package.
2. Follow `runbooks/sos-leah-quickstart.md`.
3. Fill env files in `env/`.
4. Run `scripts/preflight-check.sh`.
5. Run smoke scripts and monitoring check.

## PC/Desktop Notes
- Core SOS workflow runs through API + web endpoints and automation, not OS-specific desktop binaries.
- If you later add a Windows-specific operator client, place installer in package `plugins/` and update quickstart.
