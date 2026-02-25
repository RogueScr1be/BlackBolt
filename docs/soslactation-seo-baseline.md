# SOS Lactation SEO Baseline

- Date: 2026-02-19
- Last updated: 2026-02-20 04:05:00 UTC
- Operator: Codex

## Phase 0 Final Closure
### Safety and baseline prerequisites
- Production backup set (Phase 0):
  - `/home1/soslaion/backups/phase0-20260219T124740Z/soslaion_wrdp1_20260219T124740Z.sql`
  - `/home1/soslaion/backups/phase0-20260219T124740Z/wp-content_20260219T124740Z.tar.gz`
- Staging clone exists: `https://soslactation.com/stg`
- Staging indexing deterrence: PASS (`blog_public=0`)
- Locked baseline URL set:
  - `https://soslactation.com/`
  - `https://soslactation.com/services/`
  - `https://soslactation.com/book-a-consultation/`
  - `https://soslactation.com/2021/01/26/how-to-really-support-breastfeeding/`

### Google API property-health rerun (28-day)
- Service account: `codex-door@sos-seo.iam.gserviceaccount.com`
- GSC property: `https://soslactation.com/` (URL-prefix)
- GSC query pull: PASS
  - top query: `sos lactation` (clicks `4`, impressions `7`)
  - top pages include homepage and key legacy posts (10 rows returned)
- GA4 Data API pull (`properties/525103985`): PASS
  - top landing: `/?gtm_latency=1` (sessions `6`)
  - top channel: `Direct` (sessions `6`)
  - top events: `first_visit=6`, `page_view=6`, `session_start=6`

### Phase 0 gate result
- Backups captured: PASS
- Staging exists + non-indexable: PASS
- Baseline URL set fixed: PASS
- Lighthouse baseline retained: PASS
- GSC/GA4 property-health via APIs: PASS
- WP technical snapshot: PASS
- **Phase 0 Ready: PASS**

## Phase 1 Focused Hardening (pre-Phase 2)
### Additional rollback artifacts from this run
- Staging hardening backup:
  - `/home1/soslaion/backups/phase1b-stg-20260219T171040Z/soslaion_wp68837_20260219T171040Z.sql`
  - `/home1/soslaion/backups/phase1b-stg-20260219T171040Z/wp-content_20260219T171040Z.tar.gz`
- Production hardening backup:
  - `/home1/soslaion/backups/phase1b-prod-20260219T171342Z/soslaion_wrdp1_20260219T171342Z.sql`
  - `/home1/soslaion/backups/phase1b-prod-20260219T171342Z/wp-content_20260219T171342Z.tar.gz`

### Deterministic noindex controls applied
- Maintained Rank Math active and Clearfy inactive.
- Extended MU policy:
  - `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-seo-phase1.php`
  - `/home1/soslaion/public_html/wp-content/mu-plugins/sos-seo-phase1.php`
- Scoped slugs forced to noindex/follow logic:
  - `checkout`, `cart`, `my-account`, `shop`, `wpbc-booking-received`, `wpbc-booking`, `cookie-policy`
- Added deterministic `send_headers` action to emit `X-Robots-Tag: noindex,follow` for scoped slugs.
- Page sitemap exclusion list updated to include scoped utility IDs (`2762`, `2763`, `2074`, `1812`, `1811`, `1814`) plus existing test/system IDs.

### Validation evidence
- Staging external check: PASS
  - scoped URLs return `x-robots-tag: noindex,follow` and robots meta `noindex, follow`
  - scoped URLs absent from staging page sitemap
- Production logic check (WordPress runtime filter evaluation): PASS
  - `/checkout/` `noindex=1 follow=1`
  - `/cart/` `noindex=1 follow=1`
  - `/my-account/` `noindex=1 follow=1`
  - `/shop/` `noindex=1 follow=1`
  - `/wpbc-booking-received/` `noindex=1 follow=1`
  - `/wpbc-booking/` `noindex=1 follow=1`
  - money pages `/services/`, `/book-a-consultation/` `noindex=0`
- Production sitemap integrity: PASS
  - page sitemap contains only core pages (`/`, `/blog/`, `/contact/`, `/services/`, `/book-a-consultation/`, `/contact-2/`)
  - scoped utility pages excluded

### Redirect/canonical checks
- `http://soslactation.com` -> `https://soslactation.com/`: PASS
- `https://www.soslactation.com` -> `https://soslactation.com/`: PASS
- `/services` -> `/services/`: PASS

### Final status from this run
- **Phase 1 Hardened: PASS**
- Residual note: production external `curl` checks intermittently timed out from this execution environment; staging external checks + production runtime filter/sitemap checks were used as deterministic evidence.

## Phase 2 CWV Hardening (Staging Only)
### Rollback artifacts
- Staging Phase 2 backup set:
  - `/home1/soslaion/backups/phase2-stg-20260219T183346Z/soslaion_wp68837_20260219T183346Z.sql`
  - `/home1/soslaion/backups/phase2-stg-20260219T183346Z/wp-content_20260219T183346Z.tar.gz`
  - `/home1/soslaion/backups/phase2-stg-20260219T183346Z/litespeed_conf_pre.tsv`

### Plugin and setting changes (staging)
- Plugins:
  - `litespeed-cache` installed and activated (`7.7`)
  - `wp-cloudflare-page-cache` deactivated (`5.2.3`)
  - `seo-by-rank-math` remained active
  - `clearfy` remained inactive
- LiteSpeed conservative toggles:
  - `litespeed.conf.cache=1`
  - `litespeed.conf.cache-browser=1`
  - `litespeed.conf.optm-css_min=1`
  - `litespeed.conf.optm-css_comb=0`
  - `litespeed.conf.optm-js_min=1`
  - `litespeed.conf.optm-js_defer=1`
  - `litespeed.conf.optm-js_delay_inc=["gtm.js","analytics.js","googletagmanager.com","google-analytics.com","gtag/js"]`
  - `litespeed.conf.optm-html_min=1`
  - `litespeed.conf.media-lazy=1`
  - `litespeed.conf.media-add_missing_sizes=1`
  - `litespeed.conf.img_optm-webp=1`
  - `litespeed.conf.optm-ucss=0`
  - `litespeed.conf.cdn-cloudflare=0`

### Pre/Post CWV evidence (locked 4 URLs)
- PSI API status: `429 quota exceeded` in this run window.
- Fallback used: Lighthouse CLI mobile+desktop on the same locked 4 staging URLs.
- Mobile performance score deltas:
  - `/stg/`: `32 -> 55` (`+23`)
  - `/stg/services/`: `33 -> 40` (`+7`)
  - `/stg/book-a-consultation/`: `42 -> 61` (`+19`)
  - `/stg/2021/01/26/how-to-really-support-breastfeeding/`: `41 -> 53` (`+12`)
- Desktop performance score deltas:
  - `/stg/`: `30 -> 68` (`+38`)
  - `/stg/services/`: `44 -> 78` (`+34`)
  - `/stg/book-a-consultation/`: `60 -> 88` (`+28`)
  - `/stg/2021/01/26/how-to-really-support-breastfeeding/`: `83 -> 87` (`+4`)
- Notable metric caveat:
  - Mobile homepage and booking LCP increased despite large TBT reduction and overall score gain.

### Technical safety checks
- Staging `blog_public=0` retained (non-indexable staging).
- Staging sitemap intact: `https://soslactation.com/stg/wp-sitemap.xml` and page sitemap list remained clean.
- Scoped utility URLs still return `X-Robots-Tag: noindex,follow` on staging:
  - `/checkout/`, `/cart/`, `/my-account/`, `/shop/`, `/wpbc-booking-received/`, `/wpbc-booking/`
- Production sanity check after staging work (no prod mutation in Phase 2):
  - `/services/` and `/book-a-consultation/` remained indexable (`noindex=0`)
  - `/checkout/` and `/cart/` remained `noindex=1 follow=1`

### Phase 2 gate result
- `Phase 2 Staging: PASS` (performance score improvement on homepage + service/commercial templates, no critical booking/contact load failure detected).
- `Production Phase 2 Ready: FAIL` (PSI unavailable this run due quota and mixed LCP movement; hold for one more validation cycle before production cutover).

## Phase 2.1 LCP Stabilization Sprint (Staging)
### Rollback artifacts
- Staging Phase 2.1 backup set:
  - `/home1/soslaion/backups/phase2-1-stg-20260219T191225Z/soslaion_wp68837_20260219T191225Z.sql`
  - `/home1/soslaion/backups/phase2-1-stg-20260219T191225Z/wp-content_20260219T191225Z.tar.gz`
  - `/home1/soslaion/backups/phase2-1-stg-20260219T191225Z/litespeed_conf_pre.tsv`

### Phase 2.1 attempted settings
- Applied during test window:
  - `litespeed.conf.guest=1`
  - `litespeed.conf.guest_optm=1`
  - `litespeed.conf.media-lazy=0` (first pass), then `1` (second pass)
- Post-test rollback completed:
  - `litespeed.conf.guest=0`
  - `litespeed.conf.guest_optm=0`
  - `litespeed.conf.media-lazy=1`

### Metrics and gate evidence
- PSI retry status: all locked URL calls returned `HTTP 429 Too Many Requests` (mobile+desktop).
- Lighthouse was used as primary comparison source.
- Pre-fix mobile baseline (start of Phase 2.1):
  - `/stg/`: perf `28`, LCP `18362.47`
  - `/stg/services/`: perf `63`, LCP `7204.66`
  - `/stg/book-a-consultation/`: perf `40`, LCP `4739.89`
  - `/stg/2021/01/26/how-to-really-support-breastfeeding/`: perf `34`, LCP `6549.34`
- Best post-fix candidate run (with `guest=1`, `guest_optm=1`, `media-lazy=0`):
  - `/stg/`: perf `54`, LCP `13015.37` (LCP improved vs prior Phase 2 baseline)
  - `/stg/services/`: perf `61`, LCP `6973.73`
  - `/stg/book-a-consultation/`: perf `57`, LCP `8459.91` (LCP regressed vs prior Phase 2 baseline)
  - `/stg/2021/01/26/how-to-really-support-breastfeeding/`: perf `60`, LCP `9301.89`
- Second candidate run (with `media-lazy=1`) failed guardrail on homepage score and still failed booking LCP target.

### Technical safety checks
- Utility noindex headers remained intact on staging:
  - `/checkout/`, `/cart/`, `/my-account/`, `/shop/`, `/wpbc-booking-received/`, `/wpbc-booking/` => `X-Robots-Tag: noindex,follow`
- Canonicals remained correct on money pages:
  - `/stg/`, `/stg/services/`, `/stg/book-a-consultation/`
- Staging page sitemap remained clean and unchanged.

### Phase 2.1 gate result
- `Phase 2.1 Staging: FAIL`
- `Production Phase 2 Ready: FAIL`
- `Phase 3 Start Ready: FAIL`
- Reason for fail:
  - booking LCP did not improve vs prior Phase 2 baseline (`5466.59 -> 8459.91`),
  - score guardrail was not consistently met across candidate runs.

## Phase 2.2 Booking-Template Remediation Sprint (Staging)
### Rollback artifacts
- Staging Phase 2.2 backup set:
  - `/home1/soslaion/backups/phase2-2-stg-20260220T034321Z/soslaion_wp68837_20260220T034321Z.sql`
  - `/home1/soslaion/backups/phase2-2-stg-20260220T034321Z/wp-content_20260220T034321Z.tar.gz`
  - `/home1/soslaion/backups/phase2-2-stg-20260220T034321Z/litespeed_conf_pre.tsv`
  - `/home1/soslaion/backups/phase2-2-stg-20260220T034321Z/plugins_pre.csv`

### Targeted changes attempted (home + booking only)
- Home page (`ID 254`) Elementor edits:
  - section node `39d42b4`: add `e-no-lazyload phase22-home-hero`
  - image widget node `d81d5d4`: `image_size=medium_large` (from `full`)
- Booking page (`ID 2507`) Elementor edits:
  - section node `678144e1`: add `e-no-lazyload phase22-booking-hero`
  - image widget node `57bdf674`: `image_size=large` + class `phase22-booking-lcp-image`
- Narrow MU policy file added during test:
  - `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-cwv-phase22.php`
  - behavior: remove accidental `fetchpriority=high` from non-target images on home/booking; set eager/high-priority and preload for target IDs `2772` and `2219`.

### Mini-gate metrics (home + booking only)
- Pre (Phase 2.2 start, Lighthouse):
  - Home mobile: perf `29`, LCP `17219.59`
  - Booking mobile: perf `64`, LCP `4902.37`
- Post (after Phase 2.2 fixes, Lighthouse):
  - Home mobile: perf `50`, LCP `16293.69`
  - Booking mobile: perf `47`, LCP `9293.58`
- Comparison vs prior Phase 2 baseline:
  - Home: perf delta `-5`, LCP delta `-690.35` (LCP improved, score guardrail failed)
  - Booking: perf delta `-14`, LCP delta `+3826.99` (LCP and score both failed)
- PSI status:
  - all mini-gate calls returned `429 Too Many Requests` (mobile+desktop for both URLs)

### Gate outcome and rollback
- Mini-gate result: FAIL
- Full 4-URL batch: NOT RUN (blocked by mini-gate failure)
- Rollback actions completed:
  - reverted Elementor node deltas on pages `254` and `2507`
  - removed `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-cwv-phase22.php`
  - flushed caches
- Post-rollback safety checks:
  - staging remains non-indexable (`blog_public=0`)
  - scoped utility URLs keep `X-Robots-Tag: noindex,follow`
  - canonicals on `/stg/` and `/stg/book-a-consultation/` remain correct

### Phase 2.2 gate result
- `Phase 2.2 Staging: FAIL`
- `Production Phase 2 Ready: FAIL`
- `Phase 3 Start Ready: FAIL`

## Phase 2.2b Booking Redesign Pass (content-first booking + background-first home)
### Rollback artifacts
- Staging Phase 2.2b backup set:
  - `/home1/soslaion/backups/phase2-2b-stg-20260220T041148Z/soslaion_wp68837_20260220T041148Z.sql`
  - `/home1/soslaion/backups/phase2-2b-stg-20260220T041148Z/wp-content_20260220T041148Z.tar.gz`
  - `/home1/soslaion/backups/phase2-2b-stg-20260220T041148Z/litespeed_conf_pre.tsv`
  - `/home1/soslaion/backups/phase2-2b-stg-20260220T041148Z/page_254_elementor_pre.json`
  - `/home1/soslaion/backups/phase2-2b-stg-20260220T041148Z/page_2507_elementor_pre.json`

### Changes attempted
- Booking content-first composition attempt:
  - moved booking secondary image section (`678144e1`) to later position,
  - set booking image widget (`57bdf674`) to smaller size variant (`medium`),
  - added template markers (`phase22b-booking-content-first`, `phase22b-booking-secondary`).
- Home background-first attempt:
  - marked hero section (`39d42b4`) with `e-no-lazyload phase22b-home-bg-first`,
  - demoted logo image widget (`d81d5d4`) from `full` to `medium_large`.
- Temporary MU plugin during test:
  - `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-cwv-phase22b.php`
  - logic: preload home background asset (`2268`) and remove priority inflation on booking/home images.

### Mini-gate metrics (home + booking only)
- Pre (Lighthouse):
  - Home mobile: perf `20`, LCP `16037.88`
  - Booking mobile: perf `60`, LCP `6674.62`
- Post (Lighthouse):
  - Home mobile: perf `55`, LCP `18225.61`
  - Booking mobile: perf `37`, LCP `5630.52`
- Gate comparison vs prior Phase 2 baseline:
  - Home: perf delta `+0`, LCP delta `+1241.57` (LCP regressed)
  - Booking: perf delta `-24`, LCP delta `+163.93` (LCP regressed; score guardrail failed)
- PSI retry:
  - `429` on all mini-gate calls (mobile+desktop for home + booking).

### Gate outcome and rollback
- Mini-gate result: FAIL
- Full 4-URL batch: NOT RUN
- Rollback completed:
  - restored Elementor JSON for pages `254` and `2507` from snapshot files,
  - removed `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-cwv-phase22b.php`,
  - flushed caches.
- Post-rollback safety:
  - staging remains non-indexable (`blog_public=0`)
  - utility URLs still `X-Robots-Tag: noindex,follow`
  - money-page canonicals intact
  - staging page sitemap remains clean

### Phase 2.2b gate result
- `Phase 2.2b Staging: FAIL`
- `Production Phase 2 Ready: FAIL`
- `Phase 3 Start Ready: FAIL`

## Phase 2.2c Booking Hero Text/CTA-First Remediation (mini-gate only)
### Rollback artifacts
- Staging Phase 2.2c backup set:
  - `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/soslaion_wp68837_20260220T153044Z.sql`
  - `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/wp-content_20260220T153044Z.tar.gz`
  - `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/plugin-list.csv`
  - `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/litespeed-option-list.csv`
  - `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/page_2507_elementor_pre.json`
  - `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/page_254_elementor_pre.json`

### Changes attempted (booking only, page `2507`)
- Elementor node updates attempted:
  - clear image payload on image-box widgets `71a9a610`, `5e1dcc7e`, `41305cbb`, `5005ea4`, `84fb074`
  - remove decorative image widget `57bdf674`
  - add section markers on `371b5fba` and `678144e1`
- Render-path troubleshooting during run:
  - detected front-end render mismatch versus stored `_elementor_data`
  - flushed Elementor CSS/cache and WordPress cache for regeneration
  - no LiteSpeed option toggles changed in this pass
- Home page (`254`) intentionally unchanged.

### Mini-gate metrics (home + booking only)
- PSI retry:
  - all requests returned `429` for mobile and desktop (home + booking), pre and post.
- Lighthouse pre:
  - Home mobile: perf `30`, LCP `16651.25`, INP/TBT proxy `2055.64`, CLS `0.0158`
  - Booking mobile: perf `58`, LCP `5762.02`, INP/TBT proxy `272.00`, CLS `0.0013`
  - Home desktop: perf `71`, LCP `2746.44`, INP/TBT proxy `0.00`, CLS `0.1185`
  - Booking desktop: perf `90`, LCP `1180.25`, INP/TBT proxy `0.00`, CLS `0.0044`
- Lighthouse post:
  - Home mobile: perf `54`, LCP `30356.30`, INP/TBT proxy `118.50`, CLS `0.0347`
  - Booking mobile: perf `32`, LCP `16603.62`, INP/TBT proxy `1188.58`, CLS `0.0001`
  - Home desktop: perf `68`, LCP `2908.46`, INP/TBT proxy `0.00`, CLS `0.1185`
  - Booking desktop: perf `39`, LCP `3945.02`, INP/TBT proxy `1079.38`, CLS `0.0077`
- Gate comparison vs locked baseline:
  - Home mobile baseline (`55`, `16984.04`): score delta `-1`, LCP delta `+13372.26`
  - Booking mobile baseline (`61`, `5466.59`): score delta `-29`, LCP delta `+11137.03`

### Gate outcome and rollback
- Mini-gate result: FAIL
  - home mobile LCP did not improve
  - booking mobile LCP did not improve
  - booking mobile score guardrail failed (`32 < 58`)
- Full 4-URL batch: NOT RUN
- Rollback executed per plan:
  - restored staging DB from `/home1/soslaion/backups/phase2-2c-stg-20260220T153044Z/soslaion_wp68837_20260220T153044Z.sql`
  - flushed Elementor CSS cache and WordPress cache
- Post-rollback safety recheck:
  - utility URLs return `X-Robots-Tag: noindex,follow` (`/stg/checkout/`, `/stg/cart/`, `/stg/my-account/`, `/stg/shop/`, `/stg/wpbc-booking-received/`, `/stg/wpbc-booking/`)
  - canonicals on `/stg/`, `/stg/services/`, `/stg/book-a-consultation/` intact
  - `/stg/wp-sitemap.xml` returns `200` and remains clean at index level
  - booking/contact endpoints return `200` after rollback

### Phase 2.2c gate result
- `Phase 2.2c Mini-Gate: FAIL`
- `Production Phase 2 Ready: FAIL`
- `Phase 3 Start Ready: FAIL`

## Phase 2.2d Booking CSS-Only Icon Suppression (mini-gate only)
### Rollback artifacts
- Staging Phase 2.2d backup set:
  - `/home1/soslaion/backups/phase2-2d-stg-20260220T160827Z/soslaion_wp68837_20260220T160827Z.sql`
  - `/home1/soslaion/backups/phase2-2d-stg-20260220T160827Z/wp-content_20260220T160827Z.tar.gz`
  - `/home1/soslaion/backups/phase2-2d-stg-20260220T160827Z/plugin-list.csv`
  - `/home1/soslaion/backups/phase2-2d-stg-20260220T160827Z/litespeed-option-list.csv`

### Changes attempted (booking only, no template-data mutation)
- Added temporary staging MU plugin:
  - `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-cwv-phase22d.php`
- Scope:
  - CSS-only suppression of booking card icon media (`.elementor-element-411cc003 .elementor-image-box-img`)
  - CSS-only suppression of decorative booking image widget (`.elementor-element-57bdf674`)
  - no Elementor JSON/post-content mutation
  - no LiteSpeed option changes

### Mini-gate metrics (home + booking only)
- PSI retry:
  - all requests returned `429` for mobile and desktop (home + booking), pre and post.
- Lighthouse pre:
  - Home mobile: perf `39`, LCP `16350.95`, INP/TBT proxy `713.45`, CLS `0.0158`
  - Booking mobile: perf `55`, LCP `12356.17`, INP/TBT proxy `176.00`, CLS `0.0000`
  - Home desktop: perf `70`, LCP `3266.99`, INP/TBT proxy `0.00`, CLS `0.1185`
  - Booking desktop: perf `57`, LCP `2182.49`, INP/TBT proxy `729.89`, CLS `0.0044`
- Lighthouse post:
  - Home mobile: perf `56`, LCP `15465.22`, INP/TBT proxy `44.00`, CLS `0.0190`
  - Booking mobile: perf `54`, LCP `12336.31`, INP/TBT proxy `197.50`, CLS `0.0000`
  - Home desktop: perf `68`, LCP `2794.38`, INP/TBT proxy `0.00`, CLS `0.1185`
  - Booking desktop: perf `53`, LCP `2435.32`, INP/TBT proxy `781.49`, CLS `0.0044`
- Gate comparison vs locked baseline:
  - Home mobile baseline (`55`, `16984.04`): score delta `+1`, LCP delta `-1518.82`
  - Booking mobile baseline (`61`, `5466.59`): score delta `-7`, LCP delta `+6869.72`

### Gate outcome and rollback
- Mini-gate result: FAIL
  - booking mobile LCP did not improve vs locked baseline
  - booking mobile score guardrail failed (`54 < 58`)
- Full 4-URL batch: NOT RUN
- Rollback executed:
  - removed `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-cwv-phase22d.php`
  - flushed Elementor CSS cache and WordPress cache
  - state confirmation via SSH: `phase22d_plugin_removed=1`, `blog_public=0`, Rank Math active, Clearfy inactive
- Post-rollback HTTP safety validation:
  - external checks temporarily blocked by connection timeouts during this run window (staging endpoints did not return within `20s` from both local and host-side curl probes)
  - retain last known passing safety state from immediately prior run and re-run safety matrix when host responsiveness normalizes

### Phase 2.2d gate result
- `Phase 2.2d Mini-Gate: FAIL`
- `Production Phase 2 Ready: FAIL`
- `Phase 3 Start Ready: FAIL`

## Booking Decommission + WPForms Remediation (Staging)
### Rollback artifacts
- Staging backup set:
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/soslaion_wp68837_20260220T172007Z.sql`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/wp-content_20260220T172007Z.tar.gz`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/plugin-list-pre.csv`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/plugin-list-post.csv`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/wpforms-entry-counts-pre.tsv`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/wpforms-entry-counts-post.tsv`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/wpforms-latest-entries-post.tsv`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/wpbc-http-pre.txt`
  - `/home1/soslaion/backups/phase-booking-wpforms-stg-20260220T172007Z/wpbc-http-post.txt`

### Booking decommission changes (staging)
- Added MU redirect policy:
  - `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-booking-decommission-stg.php`
- Redirect map (301):
  - `/stg/wpbc-booking/` -> `/stg/book-a-consultation/`
  - `/stg/wpbc-booking-received/` -> `/stg/book-a-consultation/`
- Deactivated plugin:
  - `booking` (`10.14.16`) set inactive on staging
- Preserved booking data structures (no drop):
  - `wp_booking`
  - `wp_booking_dates_props`
  - `wp_bookingdates`

### Booking decommission verification
- `booking_active=0` confirmed via WP-CLI.
- Redirect responses:
  - `/stg/wpbc-booking/` returns `301` with `location: https://soslactation.com/stg/book-a-consultation/`
  - `/stg/wpbc-booking-received/` returns `301` with same target
- Smoke checks:
  - `/stg/` returns `200`
  - `/stg/book-a-consultation/` returns `200`

### WPForms remediation findings and actions
- Storage integrity confirmed:
  - `wp_wpforms_entries` exists with live rows (`1902` pre-run)
  - latest production-like payment rows remain present for form IDs `2495`, `2858`, `2452`
- Form settings audit:
  - no `disable_entries` flag found on active consultation forms
- Permission hardening:
  - administrator role granted/confirmed:
    - `wpforms_view_entries`
    - `wpforms_edit_entries`
    - `wpforms_delete_entries`
    - `wpforms_view_entry_single`
    - `wpforms_edit_forms`
    - `wpforms_view_forms`
  - admin users `1`, `2`, `5` confirmed with `can_view_entries=1` and `can_manage_options=1`
- Cache/update refresh:
  - deleted all transients
  - forced `wp_update_plugins` cron
  - result remains: no WPForms updates offered through WP updater
- Update-path root cause:
  - `license_present=0` in `wpforms_settings`
  - Stripe live keys remain configured (`stripe_live_pk_present=1`, `stripe_live_sk_present=1`)

### WPForms write-path validation
- Staging test write executed via WPForms entry handler:
  - inserted `entry_id=1905` on `form_id=2495`, `type=manual_test`, status `completed`
  - max entry ID moved `1904 -> 1905`
  - confirms DB write-path is functional

### Gate outcomes
- `Booking Decommission Staging: PASS`
- `WPForms Storage Integrity: PASS`
- `WPForms Admin Visibility Remediation: PARTIAL` (capability and data-path validated; dashboard UI visibility requires authenticated browser check)
- `WPForms Update Path: FAIL` (license missing; no package updates available)
- `Production Mutation: HOLD` (no production changes performed)

## Decommission Wave (Staging First -> Production) — 2026-02-20
### Scope
- Plugins decommissioned in this wave:
  - `booking`
  - `clearfy`
  - `i-recommend-this`
  - `mailchimp-for-wp`
- Preserved active form/payment stack:
  - `wpforms`
  - `wpforms-stripe`
  - `wpforms-paypal-standard`

### Backup and rollback references
- Root bundle: `/home1/soslaion/backups/decom-wave-20260220T185031Z`
- Staging artifacts:
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/stg/db-pre.sql`
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/stg/wp-content-pre.tar.gz`
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/stg/plugins-pre.csv`
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/stg/plugins-post.csv`
- Production artifacts:
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/prod/db-pre.sql`
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/prod/wp-content-pre.tar.gz`
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/prod/plugins-pre.csv`
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/prod/plugins-post.csv`

### Redirect controls applied
- Staging MU redirect (`301`):
  - `/home1/soslaion/public_html/stg/wp-content/mu-plugins/sos-booking-decommission-stg.php`
  - `/stg/wpbc-booking/` -> `/stg/book-a-consultation/`
  - `/stg/wpbc-booking-received/` -> `/stg/book-a-consultation/`
- Production MU redirect (`301`):
  - `/home1/soslaion/public_html/wp-content/mu-plugins/sos-booking-decommission.php`
  - `/wpbc-booking/` -> `/book-a-consultation/`
  - `/wpbc-booking-received/` -> `/book-a-consultation/`

### Verification evidence
- Staging gate file:
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/stg/status.txt`
- Production gate file:
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/prod/status.txt`
- Verification matrices:
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/stg/verify.txt`
  - `/home1/soslaion/backups/decom-wave-20260220T185031Z/prod/verify.txt`
- Booking tables retained (quarantine, no drop):
  - `wp_booking`, `wp_booking_dates_props`, `wp_bookingdates`

### WPForms safety checks
- Addons stayed active after decommission:
  - `wpforms` `1.4.9`
  - `wpforms-stripe` `2.0.1`
  - `wpforms-paypal-standard` `1.1.1`
- Write-path validation:
  - Staging: `pre_count=1511`, `post_count=1512`, latest `entry_id=1906` (`manual_test_decom_wave`)
  - Production: `pre_count=1511`, `post_count=1512`, latest `entry_id=1906` (`manual_test_decom_wave`)
  - Evidence:
    - `/home1/soslaion/backups/decom-wave-20260220T185031Z/stg/wpforms-write-check.txt`
    - `/home1/soslaion/backups/decom-wave-20260220T185031Z/prod/wpforms-write-check.txt`

### Gate outcomes
- `Decommission Wave Staging: PASS`
- `Decommission Wave Production: PASS`

## 2026-02-21 — Phase 2R Recovery PASS + Production Promotion
### Backup and rollback references
- Staging pre-Phase2R bundle:
  - `/home1/soslaion/backups/phase2r-stg-20260220T235339Z`
- Production pre-promotion bundle:
  - `/home1/soslaion/backups/phase2r-prod-20260221T021159Z`
- WPForms transition archive bundle:
  - `/home1/soslaion/backups/wpforms-transition-20260221T022529Z`

### CWV evidence
- Mini-gate (`home + booking`, mobile) from `docs/reports/cwv/2026-02-21-phase2r-mini-pass6`:
  - Home: perf `35 -> 59`, LCP `13540.46 -> 8039.77`
  - Booking: perf `35 -> 34`, LCP `7577.04 -> 5620.02`
- Full locked set (`4 URLs`, mobile+desktop) from `docs/reports/cwv/2026-02-21-phase2r-post2`.
- Mobile gate evaluation (criteria from thread) in `docs/reports/cwv/2026-02-21-phase2r-post2/gate.txt`:
  - home LCP improved: `PASS`
  - booking LCP improved: `PASS`
  - worst mobile score delta across locked URLs: `0` (no drop >3): `PASS`
- Gate decision: `Phase 2R Mobile Gate PASS`.

### Production promotion actions
- Promoted staging CWV patch to production:
  - `/home1/soslaion/public_html/wp-content/mu-plugins/sos-cwv-phase2r.php`
- Production smoke and redirect checks:
  - `/`, `/services/`, `/book-a-consultation/`, `/contact/` all `200`, no fatal markers.
  - `/wpbc-booking/` and `/wpbc-booking-received/` remain single-hop `301` to `/book-a-consultation/`.

### Phase 3 showcase SEO execution (staging -> production)
- Showcase URLs implemented:
  - `/`
  - `/services/`
  - `/book-a-consultation/`
  - `/contact/`
  - `/2021/01/26/how-to-really-support-breastfeeding/`
  - `/2020/08/27/which-is-not-true-of-thrush/`
- Content + metadata mutations applied by WP-CLI on staging and production:
  - Elementor widget copy updates on pages `254`, `1170`, `2507`, `959`
  - Rank Math metadata updates on IDs `254`, `1170`, `2507`, `959`, `2672`, `2606`, `2608`
  - Internal-link graph hardening:
    - services -> booking + authority posts
    - booking -> services + authority post
    - authority posts -> services + booking
- Added deterministic SEO MU plugin:
  - `/home1/soslaion/public_html/wp-content/mu-plugins/sos-seo-showcase.php`
  - mirrored to staging path
  - behavior: showcase title map, showcase meta descriptions, LocalBusiness schema (home), Service+FAQ schema (services), Service schema (booking)

### Production post-promotion verification
- Fresh-render (`?nocachecheck=`) validation confirmed:
  - showcase titles present on all target URLs
  - showcase meta descriptions present on all target URLs
  - schema counts:
    - home: `1`
    - services: `2`
    - booking: `1`
- Canonicals remained correct on showcase set.
- Sitemap remained `200` at `https://soslactation.com/wp-sitemap.xml`.

### Phase 4 local-pack execution artifacts
- NAP/local messaging normalized in contact template (`page 959`) and reflected in LocalBusiness schema.
- Added local-pack operations runbook:
  - `/Users/thewhitley/Documents/New project/docs/runbooks/soslactation-local-pack-cadence.md`
- Added weekly review cadence template:
  - `/Users/thewhitley/Documents/New project/docs/reports/soslactation-review-cadence-template.csv`

### Phase 5 WPForms transition (non-blocking) deliverables
- WPForms stayed active and writable (`wpforms`, `wpforms-stripe`, `wpforms-paypal-standard`).
- Exported migration source-of-truth bundle:
  - `/home1/soslaion/backups/wpforms-transition-20260221T022529Z`
  - includes WPForms table dump + form JSON + entry index.
- Added cutover checklist:
  - `/Users/thewhitley/Documents/New project/docs/runbooks/soslactation-wpforms-cutover-checklist.md`

### Utility noindex closure
- Added narrow `.htaccess` header rules on production and staging for utility slugs:
  - `/checkout/`, `/cart/`, `/shop/`, `/my-account/`, `/cookie-policy/`, `/wpbc-booking/`, `/wpbc-booking-received/`
- Production header validation now returns `X-Robots-Tag: noindex,follow` on utility URLs.
- Sitemap endpoint remained healthy after rule deployment (`/wp-sitemap.xml` => `200`).
- `.htaccess` rollback snapshots:
  - `/home1/soslaion/backups/phase2r-prod-20260221T023004Z.htaccess.pre`
  - `/home1/soslaion/backups/phase2r-prod-20260221T023004Z.stg.htaccess.pre`
