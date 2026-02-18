import { ServiceUnavailableException } from '@nestjs/common';
import { SosPostmarkClient } from '../src/modules/sos/email/sos-postmark.client';

describe('SosPostmarkClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SOS_POSTMARK_SERVER_TOKEN;
    delete process.env.SOS_POSTMARK_FROM_EMAIL;
  });

  it('fails when required env is missing', async () => {
    const client = new SosPostmarkClient();
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
    process.env.SOS_POSTMARK_SERVER_TOKEN = 'pm_token';
    process.env.SOS_POSTMARK_FROM_EMAIL = 'noreply@soslactation.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ MessageID: 'pm_123' })
    } as Response);

    const client = new SosPostmarkClient();
    const result = await client.sendFollowUp({
      tenantId: 'tenant-sos',
      toEmail: 'leah@example.com',
      parentName: 'Leah',
      subject: 'Test',
      bodyText: 'Hello',
      caseId: 'case_1'
    });

    expect(result.provider).toBe('postmark');
    expect(result.providerMessageId).toBe('pm_123');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
