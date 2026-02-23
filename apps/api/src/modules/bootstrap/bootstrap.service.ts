import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(tenantId: string) {
    const [tenant, operatorCredential] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          gbpIntegrationStatus: true,
          gbpAccountId: true,
          gbpLocationId: true,
          gbpAccessTokenRef: true
        }
      }),
      this.prisma.operatorCredential.findUnique({
        where: { tenantId },
        select: { tenantId: true, rotatedAt: true }
      })
    ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const hasPostmarkSecret = Boolean(process.env.POSTMARK_WEBHOOK_SECRET);
    const hasPostmarkBasicAuth = Boolean(process.env.POSTMARK_WEBHOOK_BASIC_AUTH_CURRENT ?? process.env.POSTMARK_WEBHOOK_BASIC_AUTH);
    const postmarkReady = hasPostmarkSecret && hasPostmarkBasicAuth;
    const schedulerReady = process.env.GBP_POLL_SCHEDULER_DISABLED !== '1';
    const gbpReady =
      tenant.gbpIntegrationStatus === 'CONNECTED' &&
      Boolean(tenant.gbpAccountId && tenant.gbpLocationId && tenant.gbpAccessTokenRef);
    const operatorReady = Boolean(operatorCredential);
    const sendMode = process.env.POSTMARK_SEND_DISABLED === '1' ? 'shadow' : 'live';

    const checks = {
      operator_auth: {
        required: true,
        ready: operatorReady,
        message: operatorReady ? 'Tenant operator credential exists.' : 'No tenant operator credential found. Run tenant seed or rotate key.'
      },
      gbp_integration: {
        required: true,
        ready: gbpReady,
        message: gbpReady ? 'GBP integration is connected.' : 'GBP integration not fully configured for tenant.'
      },
      postmark_webhook: {
        required: true,
        ready: postmarkReady,
        message: postmarkReady
          ? 'Postmark webhook auth + secret configured.'
          : 'Postmark webhook secret/basic auth missing in runtime env.'
      },
      review_scheduler: {
        required: true,
        ready: schedulerReady,
        message: schedulerReady ? 'Review poll scheduler enabled.' : 'GBP poll scheduler disabled by runtime flag.'
      },
      send_mode: {
        required: false,
        ready: true,
        mode: sendMode,
        message: sendMode === 'shadow' ? 'Shadow-safe mode (simulated sends).' : 'Live-send mode enabled.'
      }
    };

    const missing = Object.entries(checks)
      .filter(([, value]) => value.required && !value.ready)
      .map(([key]) => key);

    return {
      tenant_id: tenant.id,
      overall_ready: missing.length === 0,
      checks,
      missing
    };
  }
}
