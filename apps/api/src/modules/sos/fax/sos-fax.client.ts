import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SosFaxSendInput, SosFaxSendResult } from '../sos.types';
import { SosIctfaxClient } from './sos-ictfax.client';
import { SosSrfaxClient } from './sos-srfax.client';

@Injectable()
export class SosFaxClient {
  constructor(
    private readonly sosSrfaxClient: SosSrfaxClient,
    private readonly sosIctfaxClient: SosIctfaxClient
  ) {}

  async sendProviderFax(input: SosFaxSendInput): Promise<SosFaxSendResult> {
    const provider = (process.env.SOS_FAX_PROVIDER ?? 'srfax').trim().toLowerCase();

    if (provider === 'srfax') {
      return this.sosSrfaxClient.sendProviderFax(input);
    }
    if (provider === 'ictfax') {
      return this.sosIctfaxClient.sendProviderFax(input);
    }

    throw new ServiceUnavailableException(`Unsupported SOS_FAX_PROVIDER: ${provider}`);
  }
}
