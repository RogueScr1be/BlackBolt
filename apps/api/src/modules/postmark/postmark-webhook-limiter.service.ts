import { Injectable } from '@nestjs/common';

type Bucket = {
  windowStartMs: number;
  count: number;
};

@Injectable()
export class PostmarkWebhookLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStartMs >= windowMs) {
      this.buckets.set(key, {
        windowStartMs: now,
        count: 1
      });
      return true;
    }

    if (bucket.count >= limit) {
      return false;
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
