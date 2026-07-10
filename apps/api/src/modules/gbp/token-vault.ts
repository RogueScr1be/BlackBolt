import { Injectable } from '@nestjs/common';

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
};

const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CACHE_REFRESH_SKEW_MS = 60_000;
const tokenCache = new Map<string, TokenSet>();

export class TokenVaultError extends Error {
  constructor(
    public readonly code: 'MISSING_REF' | 'REFUSED' | 'REVOKED' | 'EXPIRED',
    message: string
  ) {
    super(message);
    this.name = 'TokenVaultError';
  }
}

export interface TokenVault {
  resolve(ref: string): Promise<TokenSet>;
  refresh(ref: string): Promise<TokenSet>;
  rotate(ref: string, tokenSet: TokenSet): Promise<string>;
}

function envKeyForRef(prefix: string, ref: string) {
  return `${prefix}_${ref.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
}

function normalizeEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readRefreshToken(ref: string): string | null {
  return (
    normalizeEnvValue(process.env[envKeyForRef('REFRESH_TOKEN_REF', ref)]) ??
    normalizeEnvValue(process.env.GBP_REFRESH_TOKEN)
  );
}

function readClientId(): string | null {
  return (
    normalizeEnvValue(process.env.GOOGLE_GBP_CLIENT_ID) ??
    normalizeEnvValue(process.env.GBP_CLIENT_ID)
  );
}

function readClientSecret(): string | null {
  return (
    normalizeEnvValue(process.env.GOOGLE_GBP_CLIENT_SECRET) ??
    normalizeEnvValue(process.env.GBP_CLIENT_SECRET)
  );
}

function isFresh(tokenSet: TokenSet): boolean {
  return tokenSet.expiresAt.getTime() - CACHE_REFRESH_SKEW_MS > Date.now();
}

@Injectable()
export class EnvTokenVault implements TokenVault {
  async resolve(ref: string): Promise<TokenSet> {
    if (!ref) {
      throw new TokenVaultError('MISSING_REF', 'Token reference is empty');
    }

    const cached = tokenCache.get(ref);
    if (cached && isFresh(cached)) {
      return cached;
    }

    // Deterministic failure modes for tests and controlled behavior.
    if (ref.startsWith('revoked:')) {
      throw new TokenVaultError('REVOKED', 'Token reference has been revoked');
    }
    if (ref.startsWith('refused:')) {
      throw new TokenVaultError('REFUSED', 'Token access refused by vault policy');
    }

    const key = envKeyForRef('TOKEN_REF', ref);
    const accessToken = normalizeEnvValue(process.env[key]);
    const refreshToken = readRefreshToken(ref);

    if (!accessToken) {
      if (refreshToken) {
        return this.refresh(ref);
      }

      throw new TokenVaultError('MISSING_REF', `No token material found for ref ${ref}`);
    }

    const tokenSet = {
      accessToken,
      refreshToken: refreshToken ?? undefined,
      expiresAt: cached?.expiresAt ?? new Date(Date.now() + 50 * 60 * 1000)
    };

    tokenCache.set(ref, tokenSet);
    return tokenSet;
  }

  async refresh(ref: string): Promise<TokenSet> {
    if (!ref) {
      throw new TokenVaultError('MISSING_REF', 'Token reference is empty');
    }

    const refreshToken = readRefreshToken(ref);
    const clientId = readClientId();
    const clientSecret = readClientSecret();

    if (!refreshToken) {
      throw new TokenVaultError('MISSING_REF', `No refresh token material found for ref ${ref}`);
    }

    if (!clientId || !clientSecret) {
      throw new TokenVaultError('REFUSED', 'Google OAuth client credentials are unavailable');
    }

    const response = await fetch(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      throw new TokenVaultError('REFUSED', `Token refresh rejected (${response.status})`);
    }

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    const accessToken = normalizeEnvValue(payload.access_token);

    if (!accessToken) {
      throw new TokenVaultError('REFUSED', 'Token refresh returned no access token');
    }

    const tokenSet: TokenSet = {
      accessToken,
      refreshToken: normalizeEnvValue(payload.refresh_token) ?? refreshToken,
      expiresAt: new Date(Date.now() + (Number.isFinite(payload.expires_in) ? Number(payload.expires_in) : 3600) * 1000)
    };

    tokenCache.set(ref, tokenSet);
    return tokenSet;
  }

  async rotate(ref: string, _tokenSet: TokenSet): Promise<string> {
    if (!ref) {
      throw new TokenVaultError('MISSING_REF', 'Cannot rotate missing token reference');
    }

    return ref;
  }
}
