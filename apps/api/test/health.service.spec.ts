import { HealthService } from '../src/modules/health/health.service';
import { WorkerHeartbeatService } from '../src/modules/health/worker-heartbeat.service';

describe('HealthService', () => {
  const createService = (heartbeat: { ok: boolean; lastActivityAt: string | null }) => {
    const prisma = {
      $queryRawUnsafe: jest.fn()
    };
    const heartbeatService = {
      readHeartbeatStatus: jest.fn().mockResolvedValue(heartbeat)
    };
    const service = new HealthService(prisma as never, heartbeatService as unknown as WorkerHeartbeatService);
    jest.spyOn(service as any, 'checkDatabase').mockResolvedValue(true);
    jest.spyOn(service as any, 'checkRedis').mockResolvedValue(true);
    return { service, heartbeatService };
  };

  it('returns healthy when worker heartbeat is fresh', async () => {
    const now = new Date().toISOString();
    const { service } = createService({ ok: true, lastActivityAt: now });
    const result = await service.getHealth();
    expect(result.checks.db).toBe(true);
    expect(result.checks.redis).toBe(true);
    expect(result.checks.worker_heartbeat).toBe(true);
    expect(result.checks.last_worker_activity_at).toBe(now);
    expect(result.ok).toBe(true);
  });

  it('returns degraded health when worker heartbeat is stale', async () => {
    const stale = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { service } = createService({ ok: false, lastActivityAt: stale });
    const result = await service.getHealth();
    expect(result.checks.db).toBe(true);
    expect(result.checks.redis).toBe(true);
    expect(result.checks.worker_heartbeat).toBe(false);
    expect(result.checks.last_worker_activity_at).toBe(stale);
    expect(result.ok).toBe(false);
  });

  it('returns degraded health when worker heartbeat is missing', async () => {
    const { service } = createService({ ok: false, lastActivityAt: null });
    const result = await service.getHealth();
    expect(result.checks.worker_heartbeat).toBe(false);
    expect(result.checks.last_worker_activity_at).toBeNull();
    expect(result.ok).toBe(false);
  });

  it('returns degraded health when redis check fails even if heartbeat is fresh', async () => {
    const now = new Date().toISOString();
    const { service } = createService({ ok: true, lastActivityAt: now });
    jest.spyOn(service as any, 'checkRedis').mockResolvedValue(false);
    const result = await service.getHealth();
    expect(result.checks.db).toBe(true);
    expect(result.checks.redis).toBe(false);
    expect(result.checks.worker_heartbeat).toBe(true);
    expect(result.ok).toBe(false);
  });
});
