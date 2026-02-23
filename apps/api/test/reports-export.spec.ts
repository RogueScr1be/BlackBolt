import { ReportsService } from '../src/modules/reports/reports.service';

describe('ReportsService export formats', () => {
  const monthlyReport = {
    tenant_id: 'tenant-1',
    month: '2026-02',
    generated_at: '2026-02-18T00:00:00.000Z',
    metrics: {
      new_5star_reviews: 14,
      reactivation_emails_sent: 100,
      open_count: 42,
      click_count: 17,
      open_rate: 0.42,
      click_rate: 0.17,
      estimated_bookings_driven: 9,
      estimated_revenue_impact_cents: 87000
    },
    totals: {
      revenue_cents: 120000,
      attributed_cents: 87000,
      bookings_count: 21,
      sent_count: 100,
      click_count: 17,
      run_count: 3,
      run_messages_sent: 95,
      run_messages_failed: 2,
      run_messages_queued: 3
    },
    estimates: {
      conservative_bookings: 6,
      base_bookings: 9,
      aggressive_bookings: 12
    },
    praised_benefits: [],
    narrative: 'Solid month'
  };

  it('generates csv with key monthly metrics', async () => {
    const operatorService = {
      getMonthlyReport: jest.fn().mockResolvedValue(monthlyReport)
    };
    const service = new ReportsService(operatorService as never);

    const csv = await service.generateMonthlyCsv('tenant-1', '2026-02');
    expect(csv).toContain('metric,value');
    expect(csv).toContain('tenant_id,tenant-1');
    expect(csv).toContain('run_count,3');
    expect(csv).toContain('run_messages_sent,95');

    const csvMap = Object.fromEntries(
      csv
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => line.split(',', 2))
    );

    expect(Number(csvMap.revenue_cents)).toBe(monthlyReport.totals.revenue_cents);
    expect(Number(csvMap.attributed_cents)).toBe(monthlyReport.totals.attributed_cents);
    expect(Number(csvMap.new_5star_reviews)).toBe(monthlyReport.metrics.new_5star_reviews);
    expect(Number(csvMap.reactivation_emails_sent)).toBe(monthlyReport.metrics.reactivation_emails_sent);
    expect(Number(csvMap.open_count)).toBe(monthlyReport.metrics.open_count);
    expect(Number(csvMap.click_count)).toBe(monthlyReport.metrics.click_count);
    expect(Number(csvMap.estimated_bookings_driven)).toBe(monthlyReport.metrics.estimated_bookings_driven);
    expect(Number(csvMap.estimated_revenue_impact_cents)).toBe(monthlyReport.metrics.estimated_revenue_impact_cents);
    expect(Number(csvMap.bookings_count)).toBe(monthlyReport.totals.bookings_count);
    expect(Number(csvMap.sent_count)).toBe(monthlyReport.totals.sent_count);
    expect(Number(csvMap.click_count)).toBe(monthlyReport.totals.click_count);
    expect(Number(csvMap.run_count)).toBe(monthlyReport.totals.run_count);
    expect(Number(csvMap.run_messages_sent)).toBe(monthlyReport.totals.run_messages_sent);
    expect(Number(csvMap.run_messages_failed)).toBe(monthlyReport.totals.run_messages_failed);
    expect(Number(csvMap.run_messages_queued)).toBe(monthlyReport.totals.run_messages_queued);
  });

  it('generates a pdf payload', async () => {
    const operatorService = {
      getMonthlyReport: jest.fn().mockResolvedValue(monthlyReport)
    };
    const service = new ReportsService(operatorService as never);

    const pdf = await service.generateMonthlyPdf('tenant-1', '2026-02');
    expect(pdf.toString('utf8', 0, 8)).toContain('%PDF-1.4');
    const pdfText = pdf.toString('utf8');
    expect(pdfText).toContain(`Revenue \\(cents\\): ${monthlyReport.totals.revenue_cents}`);
    expect(pdfText).toContain(`Attributed \\(cents\\): ${monthlyReport.totals.attributed_cents}`);
    expect(pdfText).toContain(`New 5-star reviews: ${monthlyReport.metrics.new_5star_reviews}`);
    expect(pdfText).toContain(`Reactivation emails sent: ${monthlyReport.metrics.reactivation_emails_sent}`);
    expect(pdfText).toContain(`Estimated revenue impact \\(cents\\): ${monthlyReport.metrics.estimated_revenue_impact_cents}`);
    expect(pdfText).toContain(`Bookings: ${monthlyReport.totals.bookings_count}`);
    expect(pdfText).toContain(`Sent: ${monthlyReport.totals.sent_count}`);
    expect(pdfText).toContain(`Clicks: ${monthlyReport.totals.click_count}`);
    expect(pdfText).toContain(`Runs: ${monthlyReport.totals.run_count}`);
  });
});
