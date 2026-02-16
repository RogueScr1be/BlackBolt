# Operator App Runbook (macOS Dock Launch)

## Build a Dock-Launchable App Bundle
From repo root:

```bash
npm run operator:package
```

This generates:

- `dist/BlackBolt Operator.app`

## Install for Daily Use
1. Open Finder and drag `dist/BlackBolt Operator.app` into `/Applications` (or `~/Applications`).
2. Launch the app once.
3. Right-click the Dock icon and choose **Options -> Keep in Dock**.

## Runtime Settings (inside app)
- API base URL: your Railway API domain
- Tenant ID: your operator tenant
- Auth header: optional (`Basic ...`, `Bearer ...`, or raw `user:pass`)

## Fallback Developer Launch
```bash
npm run operator:start
```
