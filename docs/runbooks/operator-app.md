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
- Tenant ID: output from `npm run tenant:seed`
- Operator Key (`X-Operator-Key`): output from `npm run tenant:seed` (shown once)
- Auth header: optional (`Basic ...`, `Bearer ...`, or raw `user:pass`)

## Tenant Bootstrap (Per-Tenant Key Flow)
Run from repo root:

```bash
npm run tenant:seed -- --name="Your Tenant" --slug=your-tenant
```

Use the printed values:
- `tenantId` -> Operator app `Tenant ID`
- `operatorKey` -> Operator app `Operator Key`

## If Buttons Don't Work
| Symptom | Likely Cause | Fix |
|---|---|---|
| `Invalid operator key` / HTTP 401 | Wrong `Operator Key` value | Update key in Settings and retry |
| `Invalid operator key` after rotation | Old key cached in app | Replace with the newest key from rotate/seed output |
| `Endpoint not available` / HTTP 404 | Wrong `API Base URL` or stale API deployment | Point to canonical API URL and verify latest deploy |
| `Cannot reach API base URL` | DNS/network/connectivity issue | Verify URL, network, and Railway/API availability |
| `Missing required settings` | Empty API URL / Tenant ID / Operator Key | Fill required fields in Settings |

## Fallback Developer Launch
```bash
bash scripts/operator/open-latest.sh
```
