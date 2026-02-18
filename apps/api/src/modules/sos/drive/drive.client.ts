import { createSign } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { requireEnv } from '../../../runtime/env';

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
};

type AccessTokenCache = {
  token: string;
  expiresAt: number;
};

function base64UrlEncode(input: Buffer | string): string {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return source
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(assertionInput: string, privateKey: string): string {
  const signer = createSign('RSA-SHA256');
  signer.update(assertionInput);
  signer.end();
  return signer
    .sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

@Injectable()
export class SosDriveClient {
  private accessTokenCache: AccessTokenCache | null = null;

  private loadServiceAccount(): GoogleServiceAccount {
    const raw = requireEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
    let parsed: GoogleServiceAccount;
    try {
      parsed = JSON.parse(raw) as GoogleServiceAccount;
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON service account credentials');
    }

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key');
    }

    return parsed;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > now + 15_000) {
      return this.accessTokenCache.token;
    }

    const serviceAccount = this.loadServiceAccount();
    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;

    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/drive.file',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp
      })
    );

    const assertionInput = `${header}.${payload}`;
    const signature = signJwt(assertionInput, serviceAccount.private_key);
    const assertion = `${assertionInput}.${signature}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Google token exchange failed: ${response.status} ${bodyText}`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    if (!body.access_token) {
      throw new Error('Google token exchange returned empty access_token');
    }

    this.accessTokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + Math.max(1, body.expires_in ?? 3600) * 1000
    };

    return body.access_token;
  }

  async createFolder(input: { name: string }): Promise<{ id: string; webViewLink: string }> {
    const rootFolderId = requireEnv('SOS_DRIVE_ROOT_FOLDER_ID');
    const accessToken = await this.getAccessToken();

    const response = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: input.name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId]
      })
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Google Drive folder creation failed: ${response.status} ${bodyText}`);
    }

    const body = (await response.json()) as { id: string; webViewLink?: string | null };
    if (!body.id) {
      throw new Error('Google Drive folder creation returned no folder id');
    }

    const webViewLink = body.webViewLink ?? `https://drive.google.com/drive/folders/${body.id}`;
    return {
      id: body.id,
      webViewLink
    };
  }
}
