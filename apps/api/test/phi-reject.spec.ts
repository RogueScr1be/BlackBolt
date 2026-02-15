import { BadRequestException } from '@nestjs/common';
import { prepareCustomerImportRowsFromCsv } from '../src/modules/common/csv-import';

describe('PHI-like column rejection', () => {
  it('rejects forbidden columns', () => {
    const csv = ['email,diagnosis,display_name', 'a@example.com,flu,Alice'].join('\n');

    expect(() => prepareCustomerImportRowsFromCsv(csv)).toThrow(BadRequestException);
  });
});
