import { Injectable } from '@nestjs/common';

@Injectable()
export class TenancyService {
  extractTenantId(headerValue: string | undefined): string | null {
    if (!headerValue) {
      return null;
    }

    const tenantId = headerValue.trim();
    return tenantId.length > 0 ? tenantId : null;
  }
}
