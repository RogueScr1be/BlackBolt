import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { GBP_BASE_URL, GbpPermanentAuthError } from './gbp.constants';
import { EnvTokenVault, TokenVaultError } from './token-vault';

export type GbpReviewRecord = {
  sourceReviewId: string;
  rating: number | null;
  body: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  redactedJson: Record<string, unknown>;
  payloadHash: string;
};

export type FetchReviewsResult = {
  reviews: GbpReviewRecord[];
  nextPageToken: string | null;
};

@Injectable()
export class GbpClient {
  private readonly logger = new Logger(GbpClient.name);

  constructor(private readonly tokenVault: EnvTokenVault) {}

  async fetchReviews(input: {
    accountId: string;
    locationId: string;
    accessTokenRef: string;
    pageToken?: string | null;
  }): Promise<FetchReviewsResult> {
    const tokenSet = await this.resolveTokenSet(input.accessTokenRef);
    const endpoint = new URL(
      `${GBP_BASE_URL}/accounts/${encodeURIComponent(input.accountId)}/locations/${encodeURIComponent(input.locationId)}/reviews`
    );

    if (input.pageToken) {
      endpoint.searchParams.set('pageToken', input.pageToken);
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenSet.accessToken}`,
        Accept: 'application/json'
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw new GbpPermanentAuthError(`GBP auth rejected (${response.status})`);
    }

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`GBP transient failure (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(`GBP unexpected response (${response.status})`);
    }

    const payload = (await response.json()) as {
      reviews?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    };

    const rows = payload.reviews ?? [];
    this.logger.log(`GBP fetched ${rows.length} reviews for location ${input.locationId}`);

    return {
      reviews: rows
        .map((review) => {
          const starRatingRaw = String(review.starRating ?? '').toUpperCase();
          const rating = Number.parseInt(starRatingRaw.replace('STAR', ''), 10);
          const reviewer = (review.reviewer as Record<string, unknown> | undefined) ?? {};
          const sourceReviewId = String(review.reviewId ?? '');
          const reviewedAt = typeof review.createTime === 'string' ? review.createTime : null;

          const redactedJson = {
            reviewId: sourceReviewId,
            starRating: review.starRating ?? null,
            createTime: review.createTime ?? null,
            updateTime: review.updateTime ?? null,
            hasComment: typeof review.comment === 'string' && review.comment.length > 0
          };

          return {
            sourceReviewId,
            rating: Number.isNaN(rating) ? null : rating,
            body: typeof review.comment === 'string' ? review.comment : null,
            reviewerName: typeof reviewer.displayName === 'string' ? reviewer.displayName : null,
            reviewedAt,
            redactedJson,
            payloadHash: createHash('sha256').update(JSON.stringify(review)).digest('hex')
          };
        })
        .filter((row) => row.sourceReviewId.length > 0),
      nextPageToken: payload.nextPageToken ?? null
    };
  }

  private async resolveTokenSet(ref: string) {
    try {
      return await this.tokenVault.resolve(ref);
    } catch (error) {
      if (error instanceof TokenVaultError && ['REVOKED', 'REFUSED', 'MISSING_REF', 'EXPIRED'].includes(error.code)) {
        throw new GbpPermanentAuthError(`TokenVault ${error.code}: ${error.message}`);
      }
      throw error;
    }
  }
}
