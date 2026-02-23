import { WorkerHeartbeatService } from '../src/modules/health/worker-heartbeat.service';

type MockRedisClient = {
  connect: jest.Mock<Promise<void>, []>;
  set: jest.Mock<Promise<string>, [string, string, 'EX', number]>;
  get: jest.Mock<Promise<string | null>, [string]>;
  disconnect: jest.Mock<void, []>;
};

function createMockRedisClient(): MockRedisClient {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    disconnect: jest.fn()
  };
}

describe('WorkerHeartbeatService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...originalEnv };
    delete process.env.WORKER_HEARTBEAT_KEY;
    delete process.env.WORKER_HEARTBEAT_INTERVAL_MS;
    delete process.env.WORKER_HEARTBEAT_TTL_SECONDS;
    delete process.env.HEALTH_WORKER_HEARTBEAT_MAX_AGE_MS;
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('publishes heartbeat at startup and on interval in worker role', async () => {
    process.env.APP_ROLE = 'worker';
    process.env.REDIS_URL = 'redis://example.test:6379';
    process.env.WORKER_HEARTBEAT_INTERVAL_MS = '1000';

    const service = new WorkerHeartbeatService();
    const mockClient = createMockRedisClient();
    jest.spyOn(service as never, 'createRedisClient').mockReturnValue(mockClient as never);

    await service.onModuleInit();

    expect(mockClient.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.set).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(mockClient.set.mock.calls.length).toBeGreaterThanOrEqual(2);

    await service.onModuleDestroy();
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('returns healthy status for fresh heartbeat timestamp', async () => {
    process.env.REDIS_URL = 'redis://example.test:6379';
    process.env.HEALTH_WORKER_HEARTBEAT_MAX_AGE_MS = '60000';

    const service = new WorkerHeartbeatService();
    const mockClient = createMockRedisClient();
    mockClient.get.mockResolvedValueOnce(new Date().toISOString());
    jest.spyOn(service as never, 'createRedisClient').mockReturnValue(mockClient as never);

    const result = await service.readHeartbeatStatus();

    expect(result.ok).toBe(true);
    expect(result.lastActivityAt).not.toBeNull();
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('returns unhealthy status for stale heartbeat timestamp', async () => {
    process.env.REDIS_URL = 'redis://example.test:6379';
    process.env.HEALTH_WORKER_HEARTBEAT_MAX_AGE_MS = '1000';

    const service = new WorkerHeartbeatService();
    const mockClient = createMockRedisClient();
    mockClient.get.mockResolvedValueOnce(new Date(Date.now() - 30_000).toISOString());
    jest.spyOn(service as never, 'createRedisClient').mockReturnValue(mockClient as never);

    const result = await service.readHeartbeatStatus();

    expect(result.ok).toBe(false);
    expect(result.lastActivityAt).not.toBeNull();
  });

  it('returns unhealthy status when redis read fails', async () => {
    process.env.REDIS_URL = 'redis://example.test:6379';

    const service = new WorkerHeartbeatService();
    const mockClient = createMockRedisClient();
    mockClient.connect.mockRejectedValueOnce(new Error('redis unavailable'));
    jest.spyOn(service as never, 'createRedisClient').mockReturnValue(mockClient as never);

    const result = await service.readHeartbeatStatus();
    expect(result).toEqual({ ok: false, lastActivityAt: null });
  });
});
