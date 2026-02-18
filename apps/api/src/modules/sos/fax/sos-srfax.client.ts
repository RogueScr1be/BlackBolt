import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SosFaxSendResult } from '../sos.types';

export class SosFaxTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SosFaxTransientError';
  }
}

@Injectable()
export class SosSrfaxClient {
  async sendProviderFax(input: {
    tenantId: string;
    caseId: string;
    toFaxNumber: string;
    subject: string;
    bodyText: string;
  }): Promise<SosFaxSendResult> {
    const provider = process.env.SOS_FAX_PROVIDER ?? 'srfax';
    if (provider !== 'srfax') {
      throw new ServiceUnavailableException(`Unsupported SOS_FAX_PROVIDER: ${provider}`);
    }

    const baseUrl = process.env.SOS_SRFAX_BASE_URL;
    const accountId = process.env.SOS_SRFAX_ACCOUNT_ID;
    const password = process.env.SOS_SRFAX_PASSWORD;
    const sender = process.env.SOS_SRFAX_SENDER_NUMBER;
    if (!baseUrl || !accountId || !password || !sender) {
      throw new ServiceUnavailableException(
        'SOS_SRFAX_BASE_URL, SOS_SRFAX_ACCOUNT_ID, SOS_SRFAX_PASSWORD, SOS_SRFAX_SENDER_NUMBER are required'
      );
    }

    const auth = Buffer.from(`${accountId}:${password}`).toString('base64');
    const url = `${baseUrl.replace(/\/+$/, '')}/send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        senderFax: sender,
        recipientFax: input.toFaxNumber,
        subject: input.subject,
        body: input.bodyText,
        metadata: {
          tenantId: input.tenantId,
          caseId: input.caseId
        }
      })
    });

    if (response.status >= 500 || response.status === 429) {
      throw new SosFaxTransientError(`SOS SRFax transient failure (${response.status})`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SOS SRFax send failed (${response.status}): ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { transmissionId?: string; status?: string };
    return {
      provider: 'srfax',
      providerTransmissionId: payload.transmissionId ?? `srfax-${Date.now()}`,
      status: payload.status ?? 'queued',
      sentAt: new Date().toISOString()
    };
  }
}
