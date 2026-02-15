import { Injectable } from '@nestjs/common';

@Injectable()
export class PostmarkMetricsService {
  private counters: Record<string, number> = {
    webhook_auth_fail_total: 0,
    webhook_auth_previous_cred_total: 0,
    webhook_duplicate_total: 0,
    send_claim_success_total: 0,
    send_claim_zero_total: 0,
    send_guard_provider_message_id_block_total: 0
  };

  increment(metric: keyof PostmarkMetricsService['counters']) {
    this.counters[metric] += 1;
  }

  snapshot() {
    return { ...this.counters };
  }
}
