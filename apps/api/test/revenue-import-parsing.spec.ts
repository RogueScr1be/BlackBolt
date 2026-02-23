import { BadRequestException } from '@nestjs/common';
import { prepareRevenueImportRowsFromCsv } from '../src/modules/common/csv-import';

describe('Revenue CSV parsing', () => {
  it('parses valid canonical rows', () => {
    const csv = [
      'occurred_at,amount_cents,currency,external_id,customer_email,link_code',
      '2026-02-18T10:00:00Z,4500,usd,ext-1,A@EXAMPLE.COM,lnk1'
    ].join('\n');

    const rows = prepareRevenueImportRowsFromCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].errorCode).toBeNull();
    expect(rows[0].normalizedJson?.currency).toBe('USD');
    expect(rows[0].normalizedJson?.customerEmail).toBe('a@example.com');
  });

  it('rejects missing required headers', () => {
    const csv = ['occurred_at,amount_cents', '2026-02-18T10:00:00Z,4500'].join('\n');
    expect(() => prepareRevenueImportRowsFromCsv(csv)).toThrow(BadRequestException);
  });

  it('rejects unsupported headers for strict canonical schema', () => {
    const csv = [
      'occurred_at,amount_cents,currency,random_col',
      '2026-02-18T10:00:00Z,4500,USD,x'
    ].join('\n');
    expect(() => prepareRevenueImportRowsFromCsv(csv)).toThrow(BadRequestException);
  });

  it('captures row-level validation errors for partial success imports', () => {
    const csv = [
      'occurred_at,amount_cents,currency,customer_email',
      'bad-date,4500,USD,a@example.com',
      '2026-02-18T10:00:00Z,-10,USD,a@example.com',
      '2026-02-18T10:00:00Z,4500,USD,not-an-email'
    ].join('\n');

    const rows = prepareRevenueImportRowsFromCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].errorCode).toBe('INVALID_OCCURRED_AT');
    expect(rows[1].errorCode).toBe('INVALID_AMOUNT_CENTS');
    expect(rows[2].errorCode).toBe('INVALID_CUSTOMER_EMAIL');
  });
});
