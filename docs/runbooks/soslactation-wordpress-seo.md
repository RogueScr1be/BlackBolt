# SOSLactation.com WordPress SEO Runbook

## Scope and Outcome
- Scope: `soslactation.com` WordPress SEO operations for speed, technical SEO integrity, and Houston local ranking growth.
- Outcome: deterministic execution path with phase gates, rollback safety, and standardized reporting.

## Operating Defaults
- SEO control plane: `Rank Math`.
- Performance stack: `LiteSpeed Cache` preferred; `WP Rocket` fallback when host stack requires it.
- Stack policy: exactly one SEO plugin and one cache/performance plugin active at a time.
- Execution mode: staging-first, then production rollout after validation.

## Prerequisites
- WordPress admin access (staging and production).
- Host access to run or trigger backups/restores.
- Google Search Console (GSC) property access.
- PageSpeed Insights (PSI) access for baseline and regression checks.

## Safety Gates (Must Pass Before Mutation)
1. Confirm staging environment is current with production content/theme/plugins.
2. Create full backup set:
- database dump,
- `wp-content` archive,
- plugin settings export for SEO + performance plugins.
3. Record current plugin inventory and versions.
4. Record rollback owner and restore SLA for production incidents.

## Phase 0: Baseline + Safety
### Tasks
1. Capture PSI for:
- homepage,
- top 3 service pages.
2. Export GSC baseline:
- Coverage summary,
- top queries,
- top pages.
3. Snapshot technical state:
- active plugins and versions,
- indexation settings,
- canonical configuration,
- sitemap endpoints currently exposed.
4. Store artifacts in a dated log entry in project notes.

### Exit Criteria
- PSI baseline exists for mobile and desktop across selected pages.
- GSC export exists.
- Backup and rollback artifacts verified readable.

## Phase 1: Stop SEO Leakage
### Target URL classes
- `/test` and `-test` URLs.
- timetable and event variant pages that should not rank.
- form confirmation, payment, utility, and system pages.
- thin archives (tag/author/date/attachment) when they do not provide unique value.

### Tasks
1. URL inventory and classification:
- classify each URL as `index`, `noindex`, `redirect`, or `delete`.
2. Apply indexation controls:
- use `noindex` meta on removable surfaces (do not rely on robots blocking for removals).
3. Canonical normalization:
- enforce `https`,
- enforce host preference (`www` or non-`www`),
- enforce trailing slash policy,
- verify one canonical per indexable page.
4. Sitemap hygiene:
- include only canonical, indexable, quality URLs.
- exclude `noindex`, redirects, thin/system URLs.
5. Internal linking cleanup:
- remove unnecessary links from indexable pages to `noindex` surfaces.

### Validation
- sample `test` URLs return `noindex`.
- service pages remain indexable with self-canonical.
- sitemap excludes `noindex` and redirected URLs.

### Exit Criteria
- all leakage classes are controlled and verified in staging crawl checks.

## Phase 2: Core Web Vitals Hardening
### Tasks
1. Configure one performance stack:
- page cache,
- browser cache,
- compression (GZIP/Brotli as available),
- CSS/JS optimization (defer/delay non-critical JS, critical CSS path as supported).
2. Image optimization:
- WebP generation/delivery,
- explicit dimensions and responsive `srcset`,
- lazy-load below-the-fold assets only.
3. Font optimization:
- local-host key fonts where feasible,
- preload only critical font files,
- reduce unnecessary weights/variants.
4. Plugin conflict remediation:
- disable overlapping optimization features in secondary plugins.

### Validation
- compare LCP/INP/CLS before vs after on same templates.
- verify no major mobile visual/layout regressions.
- verify no JS interaction breakage for booking/contact paths.

### Exit Criteria
- CWV trend improves or remains stable with no functional regressions.

## Phase 3: Local SEO Dominance
### Tasks
1. Structured data implementation:
- `LocalBusiness` plus `MedicalOrganization` only if medically appropriate for entity representation.
- `Service` schema for core service pages.
- `FAQ` schema for eligible pages with visible FAQ content.
2. Local intent optimization:
- Houston intent in title/H1/meta for priority pages.
- consistent NAP and service-area language.
3. Location landing pages:
- publish 3-5 unique pages (for example: West U, Heights, Tanglewood variants),
- unique local proof and localized service context,
- internal links to booking and parent service pages.

### Validation
- Rich Results/Schema checks pass.
- NAP consistency confirmed across homepage, contact, and location/service pages.

### Exit Criteria
- schema valid, local pages unique, and internal local cluster linking complete.

## Phase 4: Content System
### Tasks
1. Refresh priority legacy posts:
- update content accuracy and date policy,
- align to current search intent,
- add FAQs,
- improve internal links to booking and service pages.
2. Add authority signals:
- IBCLC credentials in author byline/bio as appropriate,
- editorial policy and citation standards for medical claims.

### Validation
- refreshed pages have clear conversion path to consultation booking.
- each refreshed post links to at least one service page and one booking path.

### Exit Criteria
- priority refresh batch complete and internally linked.

## Phase 5: Monitoring and Regression Prevention
### Cadence
- Monthly:
  - CWV review,
  - plugin overlap audit,
  - sitemap/indexation spot-check.
- Quarterly:
  - schema validation sweep,
  - content refresh prioritization update,
  - local rank cluster review.

### Query Cluster Tracking
- Track core cluster: `lactation consultant houston`.
- Track location modifiers and service-intent variants.

## Reporting Template (Required Every Run)
Use this exact structure:

```md
## SOS Lactation SEO Change Report
- Date:
- Environment: staging | production
- Operator:

### Plugins Changed
- Added:
- Removed:
- Updated:

### Settings Changed
- SEO:
- Performance:
- Canonical/Indexation:

### URLs Touched
- Noindex applied:
- Canonical updated:
- Sitemap included/excluded:

### Metrics Delta
- PSI Before (mobile/desktop):
- PSI After (mobile/desktop):
- CWV Before (LCP/INP/CLS):
- CWV After (LCP/INP/CLS):

### Risks and Rollback
- Risks observed:
- Rollback steps executed/readied:
- Remaining watch items:
```

## Per-Phase Deliverables (Required)
For each phase, provide:
- exact files/pages changed,
- plugin changes and settings changed,
- before/after metrics for validated URLs,
- risks introduced and rollback steps,
- next-phase readiness checklist with explicit `PASS` or `FAIL`.

## Production Cutover Protocol
1. Re-run full staging checklist and validation scenarios.
2. Roll out in strict order:
- index hygiene,
- performance stack changes,
- on-page metadata/structure,
- schema updates,
- content updates.
3. Immediately after production rollout:
- purge WordPress and CDN caches,
- rerun PSI on baseline URL set,
- perform visual QA on key templates,
- verify Search Console sitemap fetch and indexing status.

## Test Cases and Scenarios
1. Indexation control:
- `test` pages are `noindex` and excluded from sitemap.
- service pages remain indexable with self-canonical.
2. Canonical consistency:
- `http` redirects to `https`,
- host normalization enforced,
- trailing slash policy consistent,
- no redirect loops/chains.
3. Sitemap integrity:
- contains only canonical indexable URLs,
- excludes `noindex`, redirects, attachments, and thin archives.
4. Performance regression checks:
- before/after LCP/INP/CLS compared on same templates,
- no mobile layout/function regression.
5. Local schema validation:
- JSON-LD passes validation checks,
- NAP consistency maintained.
6. Rollback drill:
- restore path tested for plugin settings and page-level SEO directives.

## Rollback Procedure
1. Revert plugin setting exports for SEO and performance plugins.
2. Restore DB backup if indexation or template state was corrupted.
3. Restore `wp-content` backup if theme/plugin asset state regressed.
4. Purge caches and revalidate:
- canonical tags,
- sitemap outputs,
- robots and noindex directives.
5. Confirm production parity and incident closure notes.

## Assumptions
- WordPress admin and staging access are available.
- Rank Math remains canonical SEO control unless explicitly superseded.
- LiteSpeed Cache is preferred when compatible with host stack; WP Rocket is acceptable fallback.
- test/thin/system URLs identified here are non-business-critical and safe for `noindex`.
- This runbook governs operations; actual WordPress mutations occur during implementation runs.
