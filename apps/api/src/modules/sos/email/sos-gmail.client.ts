import { createSign } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SosEmailSendResult } from '../sos.types';

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
export class SosGmailClient {
  private accessTokenCache: AccessTokenCache | null = null;

  private loadServiceAccount(): GoogleServiceAccount {
    const raw = process.env.SOS_GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw?.trim()) {
      throw new ServiceUnavailableException('SOS_GOOGLE_SERVICE_ACCOUNT_JSON is required');
    }

    let parsed: GoogleServiceAccount;
    try {
      parsed = JSON.parse(raw) as GoogleServiceAccount;
    } catch {
      throw new ServiceUnavailableException('SOS_GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON');
    }

    if (!parsed.client_email || !parsed.private_key) {
      throw new ServiceUnavailableException('SOS_GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key');
    }

    return parsed;
  }

  private getDelegatedUser(): string {
    const delegatedUser = process.env.SOS_GMAIL_DELEGATED_USER?.trim();
    if (!delegatedUser) {
      throw new ServiceUnavailableException('SOS_GMAIL_DELEGATED_USER is required');
    }
    return delegatedUser;
  }

  private getFromEmail(): string {
    const fromEmail = process.env.SOS_GMAIL_FROM_EMAIL?.trim();
    if (!fromEmail) {
      throw new ServiceUnavailableException('SOS_GMAIL_FROM_EMAIL is required');
    }
    return fromEmail;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > now + 15_000) {
      return this.accessTokenCache.token;
    }

    const serviceAccount = this.loadServiceAccount();
    const delegatedUser = this.getDelegatedUser();
    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;

    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64UrlEncode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/gmail.send',
        aud: 'https://oauth2.googleapis.com/token',
        sub: delegatedUser,
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
      throw new Error(`SOS Gmail token exchange failed (${response.status}): ${bodyText.slice(0, 240)}`);
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error('SOS Gmail token exchange returned empty access_token');
    }

    this.accessTokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + Math.max(1, body.expires_in ?? 3600) * 1000
    };

    return body.access_token;
  }

  async sendFollowUp(input: {
    tenantId: string;
    toEmail: string;
    parentName: string | null;
    subject: string;
    bodyText: string;
    caseId: string;
  }): Promise<SosEmailSendResult> {
    const fromEmail = this.getFromEmail();
    const delegatedUser = this.getDelegatedUser();
    const accessToken = await this.getAccessToken();

    const greeting = input.parentName ? `Hi ${input.parentName},\n\n` : '';
    const message = [
      `From: ${fromEmail}`,
      `To: ${input.toEmail}`,
      `Subject: ${input.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      `X-SOS-Tenant-Id: ${input.tenantId}`,
      `X-SOS-Case-Id: ${input.caseId}`,
      '',
      `${greeting}${input.bodyText}`
    ].join('\r\n');

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(delegatedUser)}/messages/send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          raw: base64UrlEncode(message)
        })
      }
    );

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`SOS Gmail send failed (${response.status}): ${bodyText.slice(0, 240)}`);
    }

    const payload = (await response.json()) as { id?: string };
    return {
      provider: 'gmail',
      providerMessageId: payload.id ?? `gmail-missing-id-${Date.now()}`,
      sentAt: new Date().toISOString()
    };
  }
}
