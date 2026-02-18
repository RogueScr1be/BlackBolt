import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SosEmailSendResult } from '../sos.types';

@Injectable()
export class SosPostmarkClient {
  async sendFollowUp(input: {
    tenantId: string;
    toEmail: string;
    parentName: string | null;
    subject: string;
    bodyText: string;
    caseId: string;
  }): Promise<SosEmailSendResult> {
    const token = process.env.SOS_POSTMARK_SERVER_TOKEN;
    const from = process.env.SOS_POSTMARK_FROM_EMAIL;
    if (!token || !from) {
      throw new ServiceUnavailableException('SOS_POSTMARK_SERVER_TOKEN and SOS_POSTMARK_FROM_EMAIL are required');
    }

    const greeting = input.parentName ? `Hi ${input.parentName},\n\n` : '';
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': token
      },
      body: JSON.stringify({
        From: from,
        To: input.toEmail,
        Subject: input.subject,
        TextBody: `${greeting}${input.bodyText}`,
        Metadata: {
          tenantId: input.tenantId,
          caseId: input.caseId,
          channel: 'sos_follow_up'
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SOS Postmark send failed (${response.status}): ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { MessageID?: string };
    return {
      provider: 'postmark',
      providerMessageId: payload.MessageID ?? `postmark-missing-id-${Date.now()}`,
      sentAt: new Date().toISOString()
    };
  }
}
