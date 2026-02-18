import { generateKeyPairSync } from 'node:crypto';
import { SosDriveClient } from '../src/modules/sos/drive/drive.client';

describe('SosDriveClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.SOS_DRIVE_ROOT_FOLDER_ID;
  });

  it('creates folder with configured root parent and returns id/link', async () => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    });

    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'svc-test@example.iam.gserviceaccount.com',
      private_key: privateKey
    });
    process.env.SOS_DRIVE_ROOT_FOLDER_ID = 'root_folder_123';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token-123', expires_in: 3600 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'folder_abc', webViewLink: 'https://drive.google.com/drive/folders/folder_abc' })
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new SosDriveClient();
    const result = await client.createFolder({ name: 'Whitley_Leah_2026-02-18' });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondCall = fetchMock.mock.calls[1];
    const secondCallOptions = secondCall[1] as RequestInit;
    const secondBody = JSON.parse(String(secondCallOptions.body));

    expect(secondBody.parents).toEqual(['root_folder_123']);
    expect(secondBody.name).toBe('Whitley_Leah_2026-02-18');
    expect(result).toEqual({
      id: 'folder_abc',
      webViewLink: 'https://drive.google.com/drive/folders/folder_abc'
    });
  });
});
