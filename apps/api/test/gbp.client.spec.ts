import { EnvTokenVault } from '../src/modules/gbp/token-vault';
import { GbpClient, normalizeStarRating } from '../src/modules/gbp/gbp.client';

const envKeys = [
  'GBP_ACCESS_TOKEN',
  'GOOGLE_GBP_CLIENT_ID',
  'GOOGLE_GBP_CLIENT_SECRET',
  'GBP_CLIENT_ID',
  'GBP_CLIENT_SECRET',
  'GBP_REFRESH_TOKEN',
  'TOKEN_REF_TOK_REF_1',
  'REFRESH_TOKEN_REF_TOK_REF_1'
] as const;

function snapshotEnv(): Record<(typeof envKeys)[number], string | undefined> {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]])) as Record<
    (typeof envKeys)[number],
    string | undefined
  >;
}

function restoreEnv(snapshot: Record<(typeof envKeys)[number], string | undefined>) {
  for (const key of envKeys) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('GbpClient star rating mapping', () => {
  let envSnapshot: Record<(typeof envKeys)[number], string | undefined>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
    jest.restoreAllMocks();
  });

  it('maps Google starRating enums to numeric ratings', async () => {
    expect(normalizeStarRating('FIVE')).toBe(5);
    expect(normalizeStarRating('ONE')).toBe(1);
    expect(normalizeStarRating('FOUR_STAR')).toBe(4);
    expect(normalizeStarRating(3)).toBe(3);
  });

  it('returns null for unknown or missing starRating values', async () => {
    expect(normalizeStarRating('STAR_RATING_UNSPECIFIED')).toBeNull();
    expect(normalizeStarRating(undefined)).toBeNull();
    expect(normalizeStarRating('')).toBeNull();
  });

  it('maps fetchReviews payloads without losing the original starRating metadata', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reviews: [
          {
            reviewId: 'review-1',
            starRating: 'FIVE',
            comment: 'Great care',
            reviewer: { displayName: 'Alex' },
            createTime: '2026-07-09T15:00:00.000Z',
            updateTime: '2026-07-09T15:00:00.000Z'
          }
        ],
        nextPageToken: null
      })
    });

    jest.spyOn(global, 'fetch' as never).mockImplementation(fetchMock as never);

    const client = new GbpClient({
      resolve: jest.fn().mockResolvedValue({ accessToken: 'access-token' }),
      refresh: jest.fn()
    } as never);

    const result = await client.fetchReviews({
      accountId: 'acct-1',
      locationId: 'loc-1',
      accessTokenRef: 'tok-ref-1'
    });

    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({
      sourceReviewId: 'review-1',
      rating: 5,
      body: 'Great care',
      reviewerName: 'Alex',
      reviewedAt: '2026-07-09T15:00:00.000Z'
    });
    expect(result.reviews[0].redactedJson).toMatchObject({
      reviewId: 'review-1',
      starRating: 'FIVE',
      hasComment: true
    });
  });

  it('rejects raw GBP_ACCESS_TOKEN fallback when the tenant token ref is missing', async () => {
    process.env.GBP_ACCESS_TOKEN = 'legacy-access-token';
    delete process.env.TOKEN_REF_TOK_REF_1;

    const vault = new EnvTokenVault();

    await expect(vault.resolve('tok-ref-1')).rejects.toMatchObject({
      code: 'MISSING_REF'
    });
  });

  it('refreshes and retries once when GBP returns 401 for a stale access token', async () => {
    process.env.TOKEN_REF_TOK_REF_1 = 'stale-access-token';
    process.env.REFRESH_TOKEN_REF_TOK_REF_1 = 'refresh-token';
    process.env.GOOGLE_GBP_CLIENT_ID = 'client-id';
    process.env.GOOGLE_GBP_CLIENT_SECRET = 'client-secret';
    delete process.env.GBP_ACCESS_TOKEN;

    let reviewCalls = 0;
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'fresh-access-token',
            expires_in: 3600
          })
        };
      }

      if (url.includes('/reviews')) {
        reviewCalls += 1;
        if (reviewCalls === 1) {
          return {
            ok: false,
            status: 401,
            json: async () => ({})
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            reviews: [
              {
                reviewId: 'review-1',
                starRating: 'FIVE',
                comment: 'Great care',
                reviewer: { displayName: 'Alex' },
                createTime: '2026-07-09T15:00:00.000Z',
                updateTime: '2026-07-09T15:00:00.000Z'
              }
            ],
            nextPageToken: null
          })
        };
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    jest.spyOn(global, 'fetch' as never).mockImplementation(fetchMock as never);

    const client = new GbpClient(new EnvTokenVault());
    const result = await client.fetchReviews({
      accountId: 'acct-1',
      locationId: 'loc-1',
      accessTokenRef: 'tok-ref-1'
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({
      sourceReviewId: 'review-1',
      rating: 5,
      reviewerName: 'Alex'
    });
  });

  it('fails closed when refresh token exchange is rejected after a 401', async () => {
    process.env.TOKEN_REF_TOK_REF_1 = 'stale-access-token';
    process.env.REFRESH_TOKEN_REF_TOK_REF_1 = 'refresh-token';
    process.env.GOOGLE_GBP_CLIENT_ID = 'client-id';
    process.env.GOOGLE_GBP_CLIENT_SECRET = 'client-secret';
    delete process.env.GBP_ACCESS_TOKEN;

    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: 'invalid_grant'
          })
        };
      }

      if (url.includes('/reviews')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({})
        };
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    jest.spyOn(global, 'fetch' as never).mockImplementation(fetchMock as never);

    const client = new GbpClient(new EnvTokenVault());

    await expect(
      client.fetchReviews({
        accountId: 'acct-1',
        locationId: 'loc-1',
        accessTokenRef: 'tok-ref-1'
      })
    ).rejects.toThrow('TokenVault REFUSED');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
