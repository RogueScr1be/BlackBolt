#!/usr/bin/env ts-node
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const repoRoot = process.cwd();
const { GbpClient } = require(path.resolve(repoRoot, 'apps/api/dist/modules/gbp/gbp.client.js'));
const { EnvTokenVault } = require(path.resolve(repoRoot, 'apps/api/dist/modules/gbp/token-vault.js'));
const { WorkerHeartbeatService } = require(path.resolve(repoRoot, 'apps/api/dist/modules/health/worker-heartbeat.service.js'));

type Status = 'PASS' | 'WARN' | 'FAIL';

type CheckResult = {
  status: Status;
  reason: string;
  nextAction: string;
  details: string[];
};

const DEFAULT_API_BASE_URL = 'https://blackbolt-api-production.up.railway.app';
const DEFAULT_TENANT_ID = 'cmoybzkon0000tm3wj7ofru4n';
const GBP_INGEST_QUEUE = 'gbp.ingest';
const DEFAULT_STALE_WINDOW_MS = 30 * 60 * 1000;

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function readNumberEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function minutesAgo(date: Date | null): string {
  if (!date) {
    return 'n/a';
  }

  const diffMs = Date.now() - date.getTime();
  return `${(diffMs / 60000).toFixed(1)}m`;
}

function formatCount(value: number): string {
  return Number.isFinite(value) ? String(value) : 'n/a';
}

function severityForChecks(checks: Array<{ ok: boolean; fatal: boolean }>): Status {
  if (checks.some((check) => !check.ok && check.fatal)) {
    return 'FAIL';
  }

  if (checks.some((check) => !check.ok)) {
    return 'WARN';
  }

  return 'PASS';
}

async function fetchJson(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, body };
}

async function main() {
  const apiBaseUrl = readEnv('REVIEW_LOOP_API_BASE_URL', DEFAULT_API_BASE_URL);
  const tenantId = readEnv('REVIEW_LOOP_TENANT_ID', DEFAULT_TENANT_ID);
  const staleWindowMs = readNumberEnv('REVIEW_LOOP_STALE_WINDOW_MS', DEFAULT_STALE_WINDOW_MS);
  const expectedFlags = {
    GBP_POLL_SCHEDULER_DISABLED: '0',
    POSTMARK_SEND_DISABLED: '1',
    REVIEW_ALERT_INBOUND_ENABLED: '0'
  };

  console.log(`[review-loop] start api_base_url=${apiBaseUrl} tenant_id=${tenantId}`);

  const prisma = new PrismaClient();
  const details: string[] = [];
  const checks: Array<{ ok: boolean; fatal: boolean }> = [];

  try {
    const health = await fetchJson(`${apiBaseUrl.replace(/\/$/, '')}/health`);
    const healthOk = health.response.status === 200 && health.body?.ok === true;
    checks.push({ ok: healthOk, fatal: true });
    details.push(`api_health=${health.response.status}`);
    if (health.body && typeof health.body === 'object') {
      const healthBody = health.body as { checks?: Record<string, unknown> };
      details.push(`api_worker_heartbeat=${String(healthBody.checks?.worker_heartbeat ?? 'n/a')}`);
      details.push(`api_last_worker_activity_at=${String(healthBody.checks?.last_worker_activity_at ?? 'n/a')}`);
    }

    const heartbeatService = new WorkerHeartbeatService();
    const heartbeat = await heartbeatService.readHeartbeatStatus();
    checks.push({ ok: heartbeat.ok, fatal: true });
    details.push(`redis_worker_heartbeat=${heartbeat.ok ? 'ok' : 'stale'}`);
    details.push(`redis_last_worker_activity_at=${heartbeat.lastActivityAt ?? 'n/a'}`);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        gbpAccountId: true,
        gbpLocationId: true,
        gbpAccessTokenRef: true
      }
    });

    const tenantOk = Boolean(tenant?.gbpAccountId && tenant?.gbpLocationId && tenant?.gbpAccessTokenRef);
    checks.push({ ok: tenantOk, fatal: true });
    details.push(`tenant_id=${tenant?.id ?? tenantId}`);
    details.push(`tenant_gbp_link=${tenantOk ? 'present' : 'missing'}`);

    let latestSuccessAt: Date | null = null;
    let latestJobRunState: string | null = null;
    let latestJobRunAt: Date | null = null;
    let recentSuccessCount = 0;
    let recentFailureCount = 0;

    if (tenantOk) {
      const latestJobRun = await prisma.jobRun.findFirst({
        where: {
          tenantId,
          queueName: GBP_INGEST_QUEUE
        },
        orderBy: { createdAt: 'desc' },
        select: {
          state: true,
          createdAt: true,
          finishedAt: true
        }
      });

      latestJobRunState = latestJobRun?.state ?? null;
      latestJobRunAt = latestJobRun?.finishedAt ?? latestJobRun?.createdAt ?? null;

      const latestSuccessRun = await prisma.jobRun.findFirst({
        where: {
          tenantId,
          queueName: GBP_INGEST_QUEUE,
          state: 'succeeded'
        },
        orderBy: { finishedAt: 'desc' },
        select: {
          finishedAt: true
        }
      });

      latestSuccessAt = latestSuccessRun?.finishedAt ?? null;

      const recentRuns = await prisma.jobRun.findMany({
        where: {
          tenantId,
          queueName: GBP_INGEST_QUEUE,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        },
        select: {
          state: true
        }
      });

      recentSuccessCount = recentRuns.filter((run: { state: string }) => run.state === 'succeeded').length;
      recentFailureCount = recentRuns.filter(
        (run: { state: string }) => run.state === 'failed' || run.state === 'dead_lettered'
      ).length;

      details.push(`latest_gbp_job_state=${latestJobRunState ?? 'n/a'}`);
      details.push(`latest_gbp_job_age=${minutesAgo(latestJobRunAt)}`);
      details.push(`latest_gbp_success_at=${latestSuccessAt?.toISOString() ?? 'n/a'}`);
      details.push(`gbp_jobs_24h_success=${formatCount(recentSuccessCount)}`);
      details.push(`gbp_jobs_24h_failed=${formatCount(recentFailureCount)}`);
    }

    const latestJobSucceeded = latestJobRunState?.toLowerCase() === 'succeeded';
    checks.push({ ok: latestJobSucceeded, fatal: true });
    details.push(`latest_gbp_job_succeeded=${latestJobSucceeded ? 'yes' : 'no'}`);

    const syncState = tenant?.gbpLocationId
      ? await prisma.gbpSyncState.findUnique({
          where: {
            tenantId_locationId: {
              tenantId,
              locationId: tenant.gbpLocationId
            }
          },
          select: {
            lastSuccessAt: true,
            nextPageToken: true,
            cooldownUntil: true
          }
        })
      : null;

    details.push(`gbp_sync_last_success_at=${syncState?.lastSuccessAt?.toISOString() ?? 'n/a'}`);
    details.push(`gbp_sync_cooldown_until=${syncState?.cooldownUntil?.toISOString() ?? 'n/a'}`);
    details.push(`gbp_sync_has_next_page=${syncState?.nextPageToken ? 'yes' : 'no'}`);

    const gbpClientOk = tenantOk
      ? await (async () => {
          try {
            const client = new GbpClient(new EnvTokenVault());
            const result = await client.fetchReviews({
              accountId: tenant!.gbpAccountId!,
              locationId: tenant!.gbpLocationId!,
              accessTokenRef: tenant!.gbpAccessTokenRef!
            });
            details.push(`gbp_reviews_list=ok`);
            details.push(`gbp_reviews_page_count=${result.reviews.length}`);
            details.push(`gbp_reviews_next_page=${result.nextPageToken ? 'yes' : 'no'}`);
            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown';
            details.push(`gbp_reviews_list=fail:${message}`);
            return false;
          }
        })()
      : false;
    checks.push({ ok: gbpClientOk, fatal: true });

    const [
      reviewCount,
      reviewClassificationCount,
      reviewQueueItemCount,
      reviewOperatorActionCount,
      customerCount,
      campaignCount,
      campaignRunCount,
      campaignMessageCount,
      draftMessageCount,
      approvalItemCount,
      linkCodeCount,
      sendEventCount
    ] = await Promise.all([
      prisma.review.count({ where: { tenantId } }),
      prisma.reviewClassification.count({ where: { tenantId } }),
      prisma.reviewQueueItem.count({ where: { tenantId } }),
      prisma.reviewOperatorAction.count({ where: { tenantId } }),
      prisma.customer.count({ where: { tenantId } }),
      prisma.campaign.count({ where: { tenantId } }),
      prisma.campaignRun.count({ where: { tenantId } }),
      prisma.campaignMessage.count({ where: { tenantId } }),
      prisma.draftMessage.count({ where: { tenantId } }),
      prisma.approvalItem.count({ where: { tenantId } }),
      prisma.linkCode.count({ where: { tenantId } }),
      prisma.sendEvent.count({ where: { tenantId } })
    ]);

    const sendPathCounts = [
      customerCount,
      campaignCount,
      campaignRunCount,
      campaignMessageCount,
      draftMessageCount,
      approvalItemCount,
      linkCodeCount,
      sendEventCount
    ];
    const sendPathClear = sendPathCounts.every((count) => count === 0);
    checks.push({ ok: sendPathClear, fatal: true });
    details.push(
      [
        `reviews=${reviewCount}`,
        `review_classifications=${reviewClassificationCount}`,
        `review_queue_items=${reviewQueueItemCount}`,
        `review_operator_actions=${reviewOperatorActionCount}`,
        `send_path_zero=${sendPathClear ? 'yes' : 'no'}`
      ].join(' ')
    );
    details.push(
      [
        `customer=${customerCount}`,
        `campaign=${campaignCount}`,
        `campaign_run=${campaignRunCount}`,
        `campaign_message=${campaignMessageCount}`,
        `draft_message=${draftMessageCount}`,
        `approval_item=${approvalItemCount}`,
        `link_code=${linkCodeCount}`,
        `send_event=${sendEventCount}`
      ].join(' ')
    );

    const reviewDataSane =
      reviewCount > 0 &&
      reviewCount === reviewClassificationCount &&
      reviewCount === reviewQueueItemCount &&
      reviewOperatorActionCount > 0;
    checks.push({ ok: reviewDataSane, fatal: false });

    const flagsOk = Object.entries(expectedFlags).every(([key, expected]) => (process.env[key] ?? '').trim() === expected);
    checks.push({ ok: flagsOk, fatal: true });
    details.push(
      `flags GBP_POLL_SCHEDULER_DISABLED=${process.env.GBP_POLL_SCHEDULER_DISABLED ?? 'unset'} POSTMARK_SEND_DISABLED=${process.env.POSTMARK_SEND_DISABLED ?? 'unset'} REVIEW_ALERT_INBOUND_ENABLED=${process.env.REVIEW_ALERT_INBOUND_ENABLED ?? 'unset'}`
    );

    const repeatedFailure = recentFailureCount >= 3;
    const staleJob = latestSuccessAt ? Date.now() - latestSuccessAt.getTime() > staleWindowMs : true;
    const healthStatus = severityForChecks(checks);
    const status: Status =
      healthStatus === 'FAIL'
        ? 'FAIL'
        : !reviewDataSane || !latestSuccessAt || staleJob || repeatedFailure
          ? 'WARN'
          : 'PASS';

    const reason =
      status === 'PASS'
        ? 'scheduler healthy, counts sane, compiled GBP client works, send path remains closed'
        : status === 'WARN'
          ? repeatedFailure
            ? 'scheduler has repeated recent failures'
            : staleJob
              ? 'latest GBP job is stale'
              : !reviewDataSane
                ? 'review counts are not yet aligned'
                : 'one or more optional checks need attention'
          : 'one or more required checks failed';

    const nextAction =
      status === 'PASS'
        ? 'Continue shadow scheduler. No send or reply execution.'
        : repeatedFailure
          ? 'Set GBP_POLL_SCHEDULER_DISABLED=1 and preserve job logs.'
          : staleJob
            ? 'Check worker activity and latest GBP JobRun timestamps.'
            : !gbpClientOk
              ? 'Refresh GBP token material and re-run the check.'
              : !sendPathClear
                ? 'Disable scheduler immediately and inspect send-path mutation.'
                : 'Investigate the reported warning before any escalation.';

    console.log(`[review-loop] status=${status}`);
    console.log(`[review-loop] reason=${reason}`);
    console.log(`[review-loop] next_action=${nextAction}`);
    for (const detail of details) {
      console.log(`[review-loop] ${detail}`);
    }

    if (status === 'FAIL') {
      process.exitCode = 1;
    } else if (status === 'WARN') {
      process.exitCode = 0;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(`[review-loop] status=FAIL reason=${message}`);
    console.error('[review-loop] next_action=Disable GBP scheduler, preserve logs, and inspect the reported failure.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(process.exitCode ?? 0);
  }
}

void main();
