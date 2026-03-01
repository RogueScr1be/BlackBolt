import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { requireEnv } from '../../../runtime/env';
import type { SosFaxSendInput, SosFaxSendResult } from '../sos.types';
import { SosFaxTransientError } from './sos-srfax.client';

type TokenCache = {
  token: string;
  expiresAt: number;
};

@Injectable()
export class SosIctfaxClient {
  private tokenCache: TokenCache | null = null;

  async sendProviderFax(input: SosFaxSendInput): Promise<SosFaxSendResult> {
    const provider = (process.env.SOS_FAX_PROVIDER ?? 'srfax').trim().toLowerCase();
    if (provider !== 'ictfax') {
      throw new ServiceUnavailableException(`Unsupported SOS_FAX_PROVIDER: ${provider}`);
    }

    const contactId = await this.createContact({
      caseId: input.caseId,
      phone: input.toFaxNumber
    });
    const documentId = await this.createDocument({
      caseId: input.caseId
    });
    await this.uploadDocumentMedia({
      documentId,
      pdfBytes: input.pdfBytes
    });
    const programId = await this.createSendFaxProgram({
      caseId: input.caseId,
      documentId
    });
    const transmissionId = await this.createTransmission({
      caseId: input.caseId,
      contactId,
      programId
    });

    await this.requestJson(`/transmissions/${encodeURIComponent(transmissionId)}/send`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    // Sending the transmission is the provider-side commit point.
    // Status polling is best-effort so transient status endpoint failures do not cause duplicate sends.
    let status = 'queued';
    try {
      const statusPayload = await this.requestJson<{ Status?: string; status?: string }>(
        `/transmissions/${encodeURIComponent(transmissionId)}/status`,
        { method: 'GET' }
      );
      status = statusPayload.Status ?? statusPayload.status ?? status;
    } catch {
      // Keep queued status when immediate status polling is unavailable.
    }

    return {
      provider: 'ictfax',
      providerTransmissionId: transmissionId,
      status,
      sentAt: new Date().toISOString()
    };
  }

  private getApiBaseUrl(): string {
    const raw = this.readRequiredEnv('SOS_ICTFAX_BASE_URL').trim().replace(/\/+$/, '');
    if (!raw) {
      throw new ServiceUnavailableException('SOS_ICTFAX_BASE_URL is required');
    }
    return raw.endsWith('/api') ? raw : `${raw}/api`;
  }

  private getCredentials(): { username: string; password: string } {
    const username = this.readRequiredEnv('SOS_ICTFAX_API_USER').trim();
    const password = this.readRequiredEnv('SOS_ICTFAX_API_PASSWORD').trim();
    if (!username || !password) {
      throw new ServiceUnavailableException('SOS_ICTFAX_API_USER and SOS_ICTFAX_API_PASSWORD are required');
    }
    return { username, password };
  }

  private readRequiredEnv(name: string): string {
    try {
      return requireEnv(name);
    } catch {
      throw new ServiceUnavailableException(`${name} is required`);
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 15_000) {
      return this.tokenCache.token;
    }

    const { username, password } = this.getCredentials();
    const payload = await this.requestJson<{ token?: string; access_token?: string; value?: string }>(
      '/authenticate',
      {
        method: 'POST',
        authRequired: false,
        body: JSON.stringify({
          username,
          password,
          passowrd: password
        })
      }
    );

    const token = payload.token ?? payload.access_token ?? payload.value;
    if (!token) {
      throw new Error('SOS ICTFax authentication response did not contain a token');
    }

    this.tokenCache = {
      token,
      expiresAt: Date.now() + 55 * 60 * 1000
    };

    return token;
  }

  private async createContact(input: { caseId: string; phone: string }): Promise<string> {
    const prefix = (process.env.SOS_ICTFAX_CONTACT_NAME_PREFIX ?? 'SOS').trim() || 'SOS';
    const response = await this.requestJson<{ contact_id?: string | number }>('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        first_name: prefix,
        last_name: input.caseId,
        phone: input.phone,
        description: `SOS provider fax contact ${input.caseId}`
      })
    });
    return this.readId(response, ['contact_id'], 'contact_id');
  }

  private async createDocument(input: { caseId: string }): Promise<string> {
    const response = await this.requestJson<{ document_id?: string | number }>('/messages/documents', {
      method: 'POST',
      body: JSON.stringify({
        name: `provider_fax_packet_${input.caseId}`,
        description: `SOS Lactation provider fax packet ${input.caseId}`
      })
    });
    return this.readId(response, ['document_id'], 'document_id');
  }

  private async uploadDocumentMedia(input: { documentId: string; pdfBytes: Buffer }): Promise<void> {
    await this.requestJson(`/messages/documents/${encodeURIComponent(input.documentId)}/media`, {
      method: 'PUT',
      contentType: 'application/pdf',
      body: input.pdfBytes
    });
  }

  private async createSendFaxProgram(input: { caseId: string; documentId: string }): Promise<string> {
    const response = await this.requestJson<{ program_id?: string | number }>('/programs/sendfax', {
      method: 'POST',
      body: JSON.stringify({
        name: `sos_provider_fax_${input.caseId}`,
        document_id: Number.isNaN(Number(input.documentId)) ? input.documentId : Number(input.documentId)
      })
    });
    return this.readId(response, ['program_id'], 'program_id');
  }

  private async createTransmission(input: {
    caseId: string;
    contactId: string;
    programId: string;
  }): Promise<string> {
    const payload: Record<string, unknown> = {
      title: `SOS Lactation Provider Fax - ${input.caseId}`,
      origin: 'sos.provider_fax.send',
      contact_id: Number.isNaN(Number(input.contactId)) ? input.contactId : Number(input.contactId),
      program_id: Number.isNaN(Number(input.programId)) ? input.programId : Number(input.programId),
      direction: 'outbound'
    };

    const accountIdRaw = process.env.SOS_ICTFAX_ACCOUNT_ID?.trim();
    if (accountIdRaw) {
      const accountId = Number(accountIdRaw);
      if (Number.isNaN(accountId)) {
        throw new ServiceUnavailableException('SOS_ICTFAX_ACCOUNT_ID must be numeric when provided');
      }
      payload.account_id = accountId;
    }

    const response = await this.requestJson<{ transmission_id?: string | number; text_id?: string | number; id?: string | number }>(
      '/transmissions',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    return this.readId(response, ['transmission_id', 'text_id', 'id'], 'transmission_id');
  }

  private readId(payload: Record<string, string | number | undefined>, keys: string[], label: string): string {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    throw new Error(`SOS ICTFax response missing ${label}`);
  }

  private async requestJson<T = Record<string, unknown>>(
    path: string,
    input: {
      method: 'GET' | 'POST' | 'PUT';
      body?: string | Buffer;
      authRequired?: boolean;
      contentType?: string;
    }
  ): Promise<T> {
    const authRequired = input.authRequired ?? true;
    const token = authRequired ? await this.getAccessToken() : null;

    const headers: Record<string, string> = {
      Accept: 'application/json'
    };
    if (input.contentType) {
      headers['Content-Type'] = input.contentType;
    } else if (typeof input.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers.Authentication = `Bearer ${token}`;
    }

    const url = `${this.getApiBaseUrl()}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: input.method,
        headers,
        body: input.body
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network failure';
      throw new SosFaxTransientError(`SOS ICTFax transient failure (network): ${message}`);
    }

    if (response.status >= 500 || response.status === 429) {
      throw new SosFaxTransientError(`SOS ICTFax transient failure (${response.status})`);
    }
    if (!response.ok) {
      throw new Error(`SOS ICTFax request failed (${response.status}) for ${path}`);
    }

    const text = await response.text();
    if (!text.trim()) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`SOS ICTFax response was not valid JSON for ${path}`);
    }
  }
}
