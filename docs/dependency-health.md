# Dependency Health Backlog

## Release Gate
- No high-severity vulnerabilities before tenant onboarding.

## Required Upgrades
1. Upgrade `multer` to v2 and validate CSV upload handling in NestJS interceptors.
2. Resolve high-severity transitive vulnerabilities reported by `npm audit` without using `--force`.

## Tracking
- Issue placeholder: `DEP-001` Multer v2 migration.
- Issue placeholder: `DEP-002` High-severity dependency remediation plan.
