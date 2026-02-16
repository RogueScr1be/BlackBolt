import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAlerts(input: { tenantId: string; state: 'open' | 'all' }) {
    const rows = await this.prisma.integrationAlert.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.state === 'open' ? { resolvedAt: null } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return {
      items: rows.map((item) => ({
        id: item.id,
        type: `${item.integration.toLowerCase()}:${item.code.toLowerCase()}`,
        severity: this.mapSeverity(item.severity),
        state: item.resolvedAt ? 'resolved' : 'open',
        tenant_id: item.tenantId,
        title: item.code,
        suggested_action: this.suggestedAction(item.code),
        execute_capability: this.executeCapability(item.code),
        created_at: item.createdAt.toISOString(),
        resolved_at: item.resolvedAt?.toISOString() ?? null
      }))
    };
  }

  private mapSeverity(raw: string): 'critical' | 'warning' | 'info' {
    if (raw === 'high') {
      return 'critical';
    }
    if (raw === 'medium') {
      return 'warning';
    }
    return 'info';
  }

  private suggestedAction(code: string): string {
    if (code.startsWith('GBP_')) {
      return 'Retry GBP ingestion and verify integration status.';
    }
    if (code.startsWith('POSTMARK_')) {
      return 'Check Postmark health and pause if needed.';
    }
    return 'Review and acknowledge alert.';
  }

  private executeCapability(code: string): 'retry-gbp-ingestion' | 'resume-postmark' | 'ack-alert' | 'none' {
    if (code.startsWith('GBP_')) {
      return 'retry-gbp-ingestion';
    }
    if (code.startsWith('POSTMARK_')) {
      return 'resume-postmark';
    }
    return 'ack-alert';
  }
}
