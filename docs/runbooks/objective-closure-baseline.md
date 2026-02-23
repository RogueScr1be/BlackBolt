# Objective Closure Baseline Evidence

Date (local): 2026-02-17  
Candidate release SHA: `08117220909eab602f95b0e27ebc9c823812522b` (`0811722`)  
Release branch: `codex/objective-closure-0811722`  
Validation tenant: `cmlqpv2il000022nkqb7llq4z`

## Baseline Freeze Checks

### Local regression gates
- `npm run ci:do-not-regress`
  - `prisma:generate`: PASS
  - `api:build`: PASS
  - `api:test`: PASS (29 suites / 87 tests)
  - `contract:coverage`: PASS (`42 operationIds matched`)
  - `contract:lint`: BLOCKED (transient DNS/network failure reaching npm registry for spectral CLI)
- `npm run ci:revenue-imports`: PASS (2 suites / 6 tests)
- `swift test` (`clients/swift/BlackBoltOperator`): PASS (3 tests)

### Production env preconditions (Railway variable inspection)
- `blackbolt-api`
  - `BUILD_SHA=08117220909eab602f95b0e27ebc9c823812522b`
  - `POSTMARK_SEND_DISABLED=1`
- `blackbolt-worker`
  - `BUILD_SHA=08117220909eab602f95b0e27ebc9c823812522b`
  - `POSTMARK_SEND_DISABLED=1`
  - `GBP_POLL_SCHEDULER_DISABLED` not present (treated enabled)

### Immediate auth validation
- Wrong operator key smoke probe returned `401`:
  - `POST /v1/tenants/cmlqpv2il000022nkqb7llq4z/operator/smoke`
  - headers: valid tenant id + invalid `x-operator-key`

## Canonical Gate Scripts and PASS Semantics
- Shadow gate: `scripts/smoke/objective-shadow-verify.sh`
  - PASS signal: output contains `Gate B: PASS`
- Live gate: `scripts/smoke/objective-live-verify.sh`
  - PASS signal: output contains `Gate C: PASS`
- Shadow rollout wrapper: `scripts/smoke/objective-rollout-shadow.sh`
  - PASS signal: wrapper exits `0` and prints `Gate B PASS`
- Live rollout wrapper: `scripts/smoke/objective-rollout-live.sh`
  - PASS signal: wrapper exits `0` and prints `Gate C PASS`
- Stabilization checker: `scripts/smoke/objective-rollout-stabilize.sh`
  - PASS signal: output contains `PASS no unresolved critical alerts`

## Execution Blockers Encountered
- `railway redeploy --service blackbolt-api` failed due DNS resolution failure to `backboard.railway.com`.
- `railway redeploy --service blackbolt-worker` failed due same DNS resolution failure.
- Shadow/live gate execution requires current rotated operator key and optional auth header.

## Next Operator Action
1. Re-run redeploy commands once Railway DNS/network is reachable.
2. Run shadow gate after 24h activity window:
   - `npm run objective:rollout:shadow -- <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> <authOrDash> <YYYY-MM>`
3. If Gate B passes, flip live send vars and run:
   - `npm run objective:rollout:live -- <apiBaseUrl> <tenantId> <operatorKey> <expectedBuildSha> <authOrDash> <YYYY-MM>`
