import { BadRequestException } from '@nestjs/common';
import { prepareCustomerImportRowsFromCsv } from '../src/modules/common/csv-import';

describe('Customer CSV parsing', () => {
  it('parses valid CSV rows', () => {
    const csv = [
      'email,display_name,last_service_date,external_customer_ref',
      'A@EXAMPLE.COM, Alice,2025-12-01,ext-1',
      'b@example.com,Bob,2024-01-20,'
    ].join('\n');

    const rows = prepareCustomerImportRowsFromCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].normalizedJson?.email).toBe('a@example.com');
    expect(rows[0].errorCode).toBeNull();
  });

  it('marks missing email rows as row error', () => {
    const csv = ['email,display_name', ',Alice'].join('\n');
    const rows = prepareCustomerImportRowsFromCsv(csv);

    expect(rows[0].errorCode).toBe('MISSING_EMAIL');
  });

  it('rejects CSV without required email column', () => {
    const csv = ['display_name,last_service_date', 'Alice,2025-01-01'].join('\n');

    expect(() => prepareCustomerImportRowsFromCsv(csv)).toThrow(BadRequestException);
  });

  it('marks invalid date values as row errors', () => {
    const csv = ['email,last_service_date', 'a@example.com,not-a-date'].join('\n');
    const rows = prepareCustomerImportRowsFromCsv(csv);

    expect(rows[0].errorCode).toBe('INVALID_LAST_SERVICE_DATE');
  });
});
