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
  async sendCampaignMessage(input: {
    tenantId: string;
    campaignMessageId: string;
    toEmail: string;
    customerDisplayName: string | null;
    bodyText: string | null;
  }): Promise<PostmarkSendResult> {
    const token = process.env.POSTMARK_SERVER_TOKEN;
    if (!token) {
      throw new Error('POSTMARK_SERVER_TOKEN is required for non-shadow sends');
    }

    const bodyText = input.bodyText?.trim().length ? input.bodyText : 'Thanks for your recent review.';
    const firstLine = bodyText.split('\n').find((line) => line.trim().length > 0) ?? '';
    const subjectFromDraft = firstLine.startsWith('Subject:') ? firstLine.replace(/^Subject:\s*/i, '') : null;
    const subject = subjectFromDraft?.trim().length
      ? subjectFromDraft.trim()
      : `BlackBolt Campaign ${input.campaignMessageId}`;
    const greeting = input.customerDisplayName ? `Hi ${input.customerDisplayName},\n\n` : '';

    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': token
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM ?? 'noreply@example.com',
        To: input.toEmail,
        Subject: subject,
        TextBody: `${greeting}${bodyText}`,
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
