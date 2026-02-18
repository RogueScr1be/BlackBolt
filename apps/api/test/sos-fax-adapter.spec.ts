import { ServiceUnavailableException } from '@nestjs/common';
import { SosFaxTransientError, SosSrfaxClient } from '../src/modules/sos/fax/sos-srfax.client';

describe('SosSrfaxClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SOS_FAX_PROVIDER;
    delete process.env.SOS_SRFAX_BASE_URL;
    delete process.env.SOS_SRFAX_ACCOUNT_ID;
    delete process.env.SOS_SRFAX_PASSWORD;
    delete process.env.SOS_SRFAX_SENDER_NUMBER;
  });

  it('fails when required env is missing', async () => {
    const client = new SosSrfaxClient();
    await expect(
      client.sendProviderFax({
        tenantId: 'tenant-sos',
        caseId: 'case_1',
        toFaxNumber: '8321112222',
        subject: 'Fax',
        bodyText: 'Body'
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('raises transient errors for retryable status', async () => {
    process.env.SOS_FAX_PROVIDER = 'srfax';
    process.env.SOS_SRFAX_BASE_URL = 'https://fax.example.com';
    process.env.SOS_SRFAX_ACCOUNT_ID = 'acct';
    process.env.SOS_SRFAX_PASSWORD = 'pass';
    process.env.SOS_SRFAX_SENDER_NUMBER = '1112223333';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503
    } as Response);

    const client = new SosSrfaxClient();
    await expect(
      client.sendProviderFax({
        tenantId: 'tenant-sos',
        caseId: 'case_1',
        toFaxNumber: '8321112222',
        subject: 'Fax',
        bodyText: 'Body'
      })
    ).rejects.toBeInstanceOf(SosFaxTransientError);
  });

  it('returns transmission id on success', async () => {
    process.env.SOS_FAX_PROVIDER = 'srfax';
    process.env.SOS_SRFAX_BASE_URL = 'https://fax.example.com';
    process.env.SOS_SRFAX_ACCOUNT_ID = 'acct';
    process.env.SOS_SRFAX_PASSWORD = 'pass';
    process.env.SOS_SRFAX_SENDER_NUMBER = '1112223333';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ transmissionId: 'tx_123', status: 'queued' })
    } as Response);

    const client = new SosSrfaxClient();
    const result = await client.sendProviderFax({
      tenantId: 'tenant-sos',
      caseId: 'case_1',
      toFaxNumber: '8321112222',
      subject: 'Fax',
      bodyText: 'Body'
    });

    expect(result.providerTransmissionId).toBe('tx_123');
    expect(result.provider).toBe('srfax');
  });
});
