import { HealthService } from '../src/modules/health/health.service';

describe('HealthService', () => {
  it('returns degraded health when worker heartbeat is stale', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      jobRun: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date(Date.now() - 60 * 60 * 1000)
        })
      }
    };

    const service = new HealthService(prisma as never);
    const result = await service.getHealth();
    expect(result.checks.db).toBe(true);
    expect(result.checks.worker_heartbeat).toBe(false);
    expect(result.ok).toBe(false);
  });
});
