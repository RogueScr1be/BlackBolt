# Phase 0 Decision Pack (Baseline)

## Version Pins
- Node: `20.19.x`
- NestJS: `11.0.3`
- Prisma / @prisma/client: `6.19.2`
- BullMQ: `5.69.2`
- Redis client (ioredis): `5.4.1`
- Swift toolchain (client generation baseline): `6.2.3`
- Apple Swift OpenAPI Generator: `1.10.4`
- Apple Swift OpenAPI Runtime: `1.9.0`
- Apple Swift OpenAPI URLSession: `1.2.0`

## Contract Workflow Notes
- OpenAPI contract source: `contracts/openapi/blackbolt.v1.yaml`
- Server operation registry for coverage: `apps/api/src/openapi-route-manifest.ts`
- CI gates: lint + breaking-check placeholder + spec coverage check
