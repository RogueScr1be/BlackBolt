import { GbpClient, normalizeStarRating } from '../src/modules/gbp/gbp.client';

describe('GbpClient star rating mapping', () => {
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

    const fetchSpy = jest.spyOn(global, 'fetch' as never).mockImplementation(fetchMock as never);

    const client = new GbpClient({
      resolve: jest.fn().mockResolvedValue({ accessToken: 'access-token' })
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

    fetchSpy.mockRestore();
  });
});
