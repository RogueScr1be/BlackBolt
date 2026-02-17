# Operator App Runbook (macOS Dock Launch)

## Build a Dock-Launchable App Bundle
From repo root:

```bash
npm run operator:package
```

This generates:

- `dist/BlackBolt Operator.app`

## Install for Daily Use
1. Run:
   ```bash
   npm run operator:install
   ```
2. If installing manually, drag `dist/BlackBolt Operator.app` into `/Applications` (or `~/Applications`).
3. Launch the app once.
4. Right-click the Dock icon and choose **Options -> Keep in Dock**.

## Runtime Settings (inside app)
- API base URL: your Railway API domain
- Tenant ID: your operator tenant
- Operator Key (`X-Operator-Key`): required for dashboard/alerts/tenant endpoints
- Auth header: optional (`Basic ...`, `Bearer ...`, or raw `user:pass`)

## If Buttons Don't Work
| Symptom | Likely Cause | Fix |
|---|---|---|
| `Invalid operator key` / HTTP 401 | Wrong `Operator Key` value | Update key in Settings and retry |
| `Operator key not configured` / HTTP 503 | API missing `OPERATOR_KEY` env var | Set `OPERATOR_KEY` on API runtime and redeploy |
| `Endpoint not available` / HTTP 404 | Wrong `API Base URL` or stale API deployment | Point to canonical API URL and verify latest deploy |
| `Cannot reach API base URL` | DNS/network/connectivity issue | Verify URL, network, and Railway/API availability |
| `Missing required settings` | Empty API URL / Tenant ID / Operator Key | Fill required fields in Settings |

## Fallback Developer Launch
```bash
bash scripts/operator/open-latest.sh
```
