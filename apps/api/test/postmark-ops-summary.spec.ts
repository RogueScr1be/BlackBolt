import { PostmarkOpsService } from '../src/modules/postmark/postmark-ops.service';
import {
  POSTMARK_INVARIANT_BREACH_RANK,
  POSTMARK_INVARIANT_CODES,
  POSTMARK_INVARIANT_UNKNOWN_CODE,
  POSTMARK_STALE_SEND_CLAIM_MINUTES,
  parsePostmarkInvariantCode,
  rankPostmarkInvariantBreach
} from '../src/modules/postmark/postmark.constants';

describe('PostmarkOpsService', () => {
  it('uses stable invariant severity ranking policy', () => {
    expect(rankPostmarkInvariantBreach('POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID')).toBeGreaterThan(
      rankPostmarkInvariantBreach('POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID')
    );
    expect(parsePostmarkInvariantCode('UNKNOWN_CODE')).toBe(POSTMARK_INVARIANT_UNKNOWN_CODE);
    expect(rankPostmarkInvariantBreach(POSTMARK_INVARIANT_UNKNOWN_CODE)).toBe(1);
    for (const code of POSTMARK_INVARIANT_CODES) {
      expect(POSTMARK_INVARIANT_BREACH_RANK[code]).toBeGreaterThan(0);
    }
  });

  it('returns operator summary with sends, webhook events, and rollups', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cm-1',
            status: 'SENT',
            deliveryState: 'DELIVERED',
            providerMessageId: 'pm-1',
            sendAttempt: 1,
            createdAt: new Date('2026-02-14T12:00:00.000Z')
          }
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0)
      },
      postmarkWebhookEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'evt-1',
            providerEventId: 'pm-evt-1',
            providerMessageId: 'pm-1',
            eventType: 'delivery',
            receivedAt: new Date('2026-02-14T12:01:00.000Z'),
            payloadRedactedJson: { RecordType: 'Delivery' },
            reconcileStatus: 'RESOLVED',
            lastError: null
          }
        ])
      },
      sendEvent: { count: jest.fn().mockResolvedValue(1) },
      postmarkSendControl: { count: jest.fn().mockResolvedValue(2) },
      integrationAlert: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: false
      }),
      acknowledgeResumeChecklist: jest.fn(),
      resumeTenantIfChecklistAcked: jest.fn()
    };

    const metrics = {
      snapshot: jest.fn().mockReturnValue({
        webhook_auth_fail_total: 0,
        webhook_auth_previous_cred_total: 0,
        webhook_duplicate_total: 0,
        send_claim_success_total: 1,
        send_claim_zero_total: 0,
        send_guard_provider_message_id_block_total: 0
      })
    };
    const service = new PostmarkOpsService(prisma as never, policyService as never, metrics as never);
    const result = await service.getOperatorSummary('tenant-1');

    expect(result.sends).toHaveLength(1);
    expect(result.webhookEvents).toHaveLength(1);
    expect(result.rollups.last1h.sent).toBeGreaterThanOrEqual(0);
    expect(result.gauges.pausedTenantsCount).toBe(2);
    expect(result.invariants.sendStateBreach.active).toBe(false);
    expect(result.invariants.sendStateBreach.runbookQuery).toBeUndefined();
    expect(result.invariants.breaches).toEqual([]);
  });

  it('flags invariant breach with runbook path when unresolved alert exists', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0)
      },
      postmarkWebhookEvent: { findMany: jest.fn().mockResolvedValue([]) },
      sendEvent: { count: jest.fn().mockResolvedValue(0) },
      postmarkSendControl: { count: jest.fn().mockResolvedValue(0) },
      integrationAlert: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'alert-1',
          code: 'POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID',
          message: 'bad state',
          createdAt: new Date('2026-02-14T15:00:00.000Z')
        })
      }
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true
      }),
      acknowledgeResumeChecklist: jest.fn(),
      resumeTenantIfChecklistAcked: jest.fn()
    };
    const metrics = { snapshot: jest.fn().mockReturnValue({}) };
    const service = new PostmarkOpsService(prisma as never, policyService as never, metrics as never);

    const result = await service.getOperatorSummary('tenant-1');
    expect(result.invariants.sendStateBreach.active).toBe(true);
    expect(result.invariants.sendStateBreach.message).toBe('Data invariant breach - requires engineering');
    expect(result.invariants.breaches).toHaveLength(1);
    expect(result.invariants.breaches[0].code).toBe('POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID');
    expect(result.invariants.sendStateBreach.runbookRef).toBe('docs/runbooks/postmark-send-invariants.md');
    expect(result.invariants.sendStateBreach.runbookQuery).toContain('SELECT');
    expect(result.invariants.sendStateBreach.runbookQuery).toContain('\n');
    expect(result.invariants.sendStateBreach.runbookRef).toBeDefined();
    expect((result.invariants.sendStateBreach.runbookRef as string).startsWith('/Users/')).toBe(false);
    const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE', ';--'];
    for (const keyword of forbidden) {
      expect(result.invariants.sendStateBreach.runbookQuery).not.toContain(keyword);
    }
    expect(result.invariants.sendStateBreach.runbookQuery).not.toContain('tenant-1');
    expect(result.invariants.sendStateBreach.runbookQuery).not.toContain('tenant_id =');
    expect(result.invariants.sendStateBreach.nextActions).toEqual(
      expect.arrayContaining([expect.stringContaining('Pause tenant send path')])
    );
  });

  it('surfaces stuck-sending invariant when stale claims exist', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'cm-stuck',
          claimedAt: new Date('2026-02-14T14:00:00.000Z')
        }),
        count: jest.fn().mockResolvedValue(0)
      },
      postmarkWebhookEvent: { findMany: jest.fn().mockResolvedValue([]) },
      sendEvent: { count: jest.fn().mockResolvedValue(0) },
      postmarkSendControl: { count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true
      }),
      acknowledgeResumeChecklist: jest.fn(),
      resumeTenantIfChecklistAcked: jest.fn()
    };
    const metrics = { snapshot: jest.fn().mockReturnValue({}) };
    const service = new PostmarkOpsService(prisma as never, policyService as never, metrics as never);

    const result = await service.getOperatorSummary('tenant-1');
    expect(result.invariants.sendStateBreach.active).toBe(true);
    expect(result.invariants.sendStateBreach.code).toBe('POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID');
    expect(result.invariants.sendStateBreach.runbookQuery).toContain("status = 'SENDING'");
    expect(result.invariants.sendStateBreach.staleThresholdMinutes).toBe(POSTMARK_STALE_SEND_CLAIM_MINUTES);
    expect(result.invariants.breaches).toHaveLength(1);
    expect(result.invariants.breaches[0].code).toBe('POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID');
  });

  it('orders breaches by severity and keeps legacy alias as top breach', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      campaignMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'cm-stuck',
          claimedAt: new Date('2026-02-14T14:00:00.000Z')
        }),
        count: jest.fn().mockResolvedValue(0)
      },
      postmarkWebhookEvent: { findMany: jest.fn().mockResolvedValue([]) },
      sendEvent: { count: jest.fn().mockResolvedValue(0) },
      postmarkSendControl: { count: jest.fn().mockResolvedValue(0) },
      integrationAlert: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'alert-1',
          code: 'POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID',
          message: 'bad state',
          createdAt: new Date('2026-02-14T15:00:00.000Z')
        })
      }
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true
      }),
      acknowledgeResumeChecklist: jest.fn(),
      resumeTenantIfChecklistAcked: jest.fn()
    };
    const metrics = { snapshot: jest.fn().mockReturnValue({}) };
    const service = new PostmarkOpsService(prisma as never, policyService as never, metrics as never);

    const result = await service.getOperatorSummary('tenant-1');
    expect(result.invariants.breaches).toHaveLength(2);
    expect(result.invariants.breaches[0].code).toBe('POSTMARK_SEND_SENT_WITHOUT_PROVIDER_ID');
    expect(result.invariants.breaches[1].code).toBe('POSTMARK_SEND_STUCK_SENDING_WITHOUT_PROVIDER_ID');
    expect(result.invariants.sendStateBreach.code).toBe(result.invariants.breaches[0].code);
  });

  it('uses a bounded query plan for operator summary', async () => {
    const tenantFindUnique = jest.fn().mockResolvedValue({ id: 'tenant-1' });
    const campaignFindMany = jest.fn().mockResolvedValue([]);
    const campaignFindFirst = jest.fn().mockResolvedValue(null);
    const campaignCount = jest.fn().mockResolvedValue(0);
    const webhookFindMany = jest.fn().mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ id: `evt-${i}` })));
    const sendCount = jest.fn().mockResolvedValue(0);
    const controlCount = jest.fn().mockResolvedValue(0);
    const alertFindFirst = jest.fn().mockResolvedValue(null);

    const prisma = {
      tenant: { findUnique: tenantFindUnique },
      campaignMessage: { findMany: campaignFindMany, findFirst: campaignFindFirst, count: campaignCount },
      postmarkWebhookEvent: { findMany: webhookFindMany },
      sendEvent: { count: sendCount },
      postmarkSendControl: { count: controlCount },
      integrationAlert: { findFirst: alertFindFirst }
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true
      }),
      acknowledgeResumeChecklist: jest.fn(),
      resumeTenantIfChecklistAcked: jest.fn()
    };
    const metrics = { snapshot: jest.fn().mockReturnValue({}) };
    const service = new PostmarkOpsService(prisma as never, policyService as never, metrics as never);

    await service.getOperatorSummary('tenant-1');

    expect(tenantFindUnique).toHaveBeenCalledTimes(1);
    expect(campaignFindMany).toHaveBeenCalledTimes(1);
    expect(campaignFindFirst).toHaveBeenCalledTimes(1);
    expect(webhookFindMany).toHaveBeenCalledTimes(1);
    expect(controlCount).toHaveBeenCalledTimes(1);
    expect(alertFindFirst).toHaveBeenCalledTimes(1);
    expect(sendCount).toHaveBeenCalledTimes(4);
    expect(campaignCount).toHaveBeenCalledTimes(2);
  });

  it('includes diagnostics only when enabled', async () => {
    process.env.POSTMARK_OPS_DIAGNOSTICS = '1';
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tenant-1' }) },
      campaignMessage: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
      postmarkWebhookEvent: { findMany: jest.fn().mockResolvedValue([]) },
      sendEvent: { count: jest.fn().mockResolvedValue(0) },
      postmarkSendControl: { count: jest.fn().mockResolvedValue(0) },
      integrationAlert: { findFirst: jest.fn().mockResolvedValue(null) }
    };
    const policyService = {
      getTenantPolicy: jest.fn().mockResolvedValue({
        pausedUntil: null,
        pauseReason: null,
        lastErrorClass: null,
        resumeChecklistAck: true
      }),
      acknowledgeResumeChecklist: jest.fn(),
      resumeTenantIfChecklistAcked: jest.fn()
    };
    const metrics = { snapshot: jest.fn().mockReturnValue({}) };
    const service = new PostmarkOpsService(prisma as never, policyService as never, metrics as never);

    const result = await service.getOperatorSummary('tenant-1');
    expect('diagnostics' in result).toBe(true);
    if ('diagnostics' in result) {
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.prismaCalls).toBeGreaterThan(0);
      expect(result.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
    }
    delete process.env.POSTMARK_OPS_DIAGNOSTICS;
  });
});
