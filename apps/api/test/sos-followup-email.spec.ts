import { generateKeyPairSync } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { SosGmailClient } from '../src/modules/sos/email/sos-gmail.client';

describe('SosGmailClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SOS_GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.SOS_GMAIL_DELEGATED_USER;
    delete process.env.SOS_GMAIL_FROM_EMAIL;
  });

  it('fails when required env is missing', async () => {
    const client = new SosGmailClient();
    await expect(
      client.sendFollowUp({
        tenantId: 'tenant-sos',
        toEmail: 'leah@example.com',
        parentName: 'Leah',
        subject: 'Test',
        bodyText: 'Hello',
        caseId: 'case_1'
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('sends follow-up and returns provider message id', async () => {
    const keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.SOS_GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'service@sos.iam.gserviceaccount.com',
      private_key: keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    });
    process.env.SOS_GMAIL_DELEGATED_USER = 'leah@soslactation.com';
    process.env.SOS_GMAIL_FROM_EMAIL = 'leah@soslactation.com';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token_123', expires_in: 3600 })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'gmail_123' })
      } as Response);

    const client = new SosGmailClient();
    const result = await client.sendFollowUp({
      tenantId: 'tenant-sos',
      toEmail: 'leah@example.com',
      parentName: 'Leah',
      subject: 'Test',
      bodyText: 'Hello',
      caseId: 'case_1'
    });

    expect(result.provider).toBe('gmail');
    expect(result.providerMessageId).toBe('gmail_123');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
