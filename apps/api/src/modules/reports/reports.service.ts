import { Injectable } from '@nestjs/common';
import { OperatorService } from '../operator/operator.service';

@Injectable()
export class ReportsService {
  constructor(private readonly operatorService: OperatorService) {}

  async generateMonthlyCsv(tenantId: string, month: string): Promise<string> {
    const report = await this.operatorService.getMonthlyReport(tenantId, month);

    const rows: Array<[string, string | number]> = [
      ['tenant_id', report.tenant_id],
      ['month', report.month],
      ['generated_at', report.generated_at],
      ['new_5star_reviews', report.metrics.new_5star_reviews],
      ['reactivation_emails_sent', report.metrics.reactivation_emails_sent],
      ['open_count', report.metrics.open_count],
      ['click_count', report.metrics.click_count],
      ['open_rate', report.metrics.open_rate],
      ['click_rate', report.metrics.click_rate],
      ['estimated_bookings_driven', report.metrics.estimated_bookings_driven],
      ['estimated_revenue_impact_cents', report.metrics.estimated_revenue_impact_cents],
      ['revenue_cents', report.totals.revenue_cents],
      ['attributed_cents', report.totals.attributed_cents],
      ['bookings_count', report.totals.bookings_count],
      ['sent_count', report.totals.sent_count],
      ['click_count', report.totals.click_count],
      ['run_count', report.totals.run_count],
      ['run_messages_sent', report.totals.run_messages_sent],
      ['run_messages_failed', report.totals.run_messages_failed],
      ['run_messages_queued', report.totals.run_messages_queued],
      ['estimate_conservative_bookings', report.estimates.conservative_bookings],
      ['estimate_base_bookings', report.estimates.base_bookings],
      ['estimate_aggressive_bookings', report.estimates.aggressive_bookings]
    ];

    const lines = ['metric,value', ...rows.map(([metric, value]) => `${metric},${this.escapeCsv(value)}`)];
    return lines.join('\n');
  }

  async generateMonthlyPdf(tenantId: string, month: string): Promise<Buffer> {
    const report = await this.operatorService.getMonthlyReport(tenantId, month);

    const lines = [
      'BlackBolt Monthly Report',
      `Tenant: ${report.tenant_id}`,
      `Month: ${report.month}`,
      `Generated: ${report.generated_at}`,
      '',
      'One-page operator metrics',
      `New 5-star reviews: ${report.metrics.new_5star_reviews}`,
      `Reactivation emails sent: ${report.metrics.reactivation_emails_sent}`,
      `Open/click rates: ${(report.metrics.open_rate * 100).toFixed(2)}% / ${(report.metrics.click_rate * 100).toFixed(2)}%`,
      `Estimated bookings driven: ${report.metrics.estimated_bookings_driven}`,
      `Estimated revenue impact (cents): ${report.metrics.estimated_revenue_impact_cents}`,
      `Revenue (cents): ${report.totals.revenue_cents}`,
      `Attributed (cents): ${report.totals.attributed_cents}`,
      `Bookings: ${report.totals.bookings_count}`,
      `Sent: ${report.totals.sent_count}`,
      `Clicks: ${report.totals.click_count}`,
      `Runs: ${report.totals.run_count}`,
      `Run sent/failed/queued: ${report.totals.run_messages_sent}/${report.totals.run_messages_failed}/${report.totals.run_messages_queued}`,
      `Praised benefits: ${report.praised_benefits.map((item) => `${item.benefit} (${item.mentions})`).join(', ') || 'none'}`,
      '',
      report.narrative
    ];

    return this.simplePdf(lines.join('\n'));
  }

  private simplePdf(text: string): Buffer {
    const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const stream = `BT\n/F1 12 Tf\n36 760 Td\n14 TL\n(${escaped.replace(/\n/g, ') Tj\nT*\n(')}) Tj\nET`;

    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj'
    ];

    let body = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(body, 'utf8'));
      body += `${obj}\n`;
    }

    const xrefStart = Buffer.byteLength(body, 'utf8');
    body += `xref\n0 ${objects.length + 1}\n`;
    body += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i += 1) {
      body += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`;
    }
    body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(body, 'utf8');
  }

  private escapeCsv(value: string | number): string {
    const raw = String(value ?? '');
    const escaped = raw.replace(/"/g, '""');
    if (/[",\n]/.test(escaped)) {
      return `"${escaped}"`;
    }
    return escaped;
  }
}
