import { Injectable } from '@nestjs/common';

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
};

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
  rotate(ref: string, tokenSet: TokenSet): Promise<string>;
}

@Injectable()
export class EnvTokenVault implements TokenVault {
  async resolve(ref: string): Promise<TokenSet> {
    if (!ref) {
      throw new TokenVaultError('MISSING_REF', 'Token reference is empty');
    }

    // Deterministic failure modes for tests and controlled behavior.
    if (ref.startsWith('revoked:')) {
      throw new TokenVaultError('REVOKED', 'Token reference has been revoked');
    }
    if (ref.startsWith('refused:')) {
      throw new TokenVaultError('REFUSED', 'Token access refused by vault policy');
    }

    const key = `TOKEN_REF_${ref.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
    const accessToken = process.env[key] ?? process.env.GBP_ACCESS_TOKEN;

    if (!accessToken) {
      throw new TokenVaultError('MISSING_REF', `No token material found for ref ${ref}`);
    }

    const expiresAt = new Date(Date.now() + 50 * 60 * 1000);
    if (expiresAt.getTime() <= Date.now()) {
      throw new TokenVaultError('EXPIRED', 'Token is expired');
    }

    return {
      accessToken,
      refreshToken: process.env.GBP_REFRESH_TOKEN,
      expiresAt
    };
  }

  async rotate(ref: string, _tokenSet: TokenSet): Promise<string> {
    if (!ref) {
      throw new TokenVaultError('MISSING_REF', 'Cannot rotate missing token reference');
    }

    return ref;
  }
}
