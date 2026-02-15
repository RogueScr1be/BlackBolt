import { Injectable } from '@nestjs/common';

export type ReconciledMessageRecord = {
  messageId: string;
  tenantId: string | null;
};

export class PostmarkProviderTransientError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'PostmarkProviderTransientError';
  }
}

export type PostmarkSendResult = {
  providerMessageId: string;
  providerEventId: string;
};

@Injectable()
export class PostmarkClient {
  async sendCampaignMessage(input: { tenantId: string; campaignMessageId: string }): Promise<PostmarkSendResult> {
    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) {
      throw new Error('POSTMARK_SERVER_TOKEN is required for non-shadow sends');
    }

    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': token
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM ?? 'noreply@example.com',
        To: process.env.POSTMARK_TO_FALLBACK ?? 'operator@example.com',
        Subject: `BlackBolt Campaign ${input.campaignMessageId}`,
        TextBody: 'Phase 5.1 send pipeline scaffold',
        Metadata: {
          tenantId: input.tenantId,
          campaignMessageId: input.campaignMessageId
        }
      })
    });

    if (response.status >= 500) {
      throw new PostmarkProviderTransientError(response.status, `Postmark provider error (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(`Postmark send failed (${response.status})`);
    }

    const body = (await response.json()) as { MessageID?: string };
    const providerMessageId = body.MessageID ?? `postmark-missing-message-id-${Date.now()}`;
    return {
      providerMessageId,
      providerEventId: `${providerMessageId}:sent`
    };
  }

  async lookupMessageById(_messageId: string): Promise<ReconciledMessageRecord | null> {
    // Phase 5.0 reconciliation scaffold: provider lookup is intentionally stubbed.
    return null;
  }
}
