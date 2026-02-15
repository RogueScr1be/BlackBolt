import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { FORBIDDEN_PHI_COLUMN_TOKENS } from './import-types';

type CsvRow = Record<string, string>;

export type CustomerImportRowDraft = {
  rowNum: number;
  rawJson: Record<string, string>;
  normalizedJson: {
    email: string;
    displayName: string | null;
    externalCustomerRef: string | null;
    lastServiceDate: string | null;
    segment: '0_90' | '90_365' | '365_plus';
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type SuppressionImportRowDraft = {
  rowNum: number;
  rawJson: Record<string, string>;
  normalizedJson: {
    email: string;
    channel: string;
    reason: string | null;
  } | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function cleanValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCsvRows(csvText: string): { headers: string[]; rows: CsvRow[] } {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as CsvRow[];

  const headers = records.length > 0 ? Object.keys(records[0]).map(normalizeHeader) : [];
  return { headers, rows: records };
}

function assertNoForbiddenColumns(headers: string[]) {
  const matched = headers.filter((header) =>
    FORBIDDEN_PHI_COLUMN_TOKENS.some((token) => header.includes(token))
  );

  if (matched.length > 0) {
    throw new BadRequestException(
      `CSV contains forbidden PHI-like columns: ${Array.from(new Set(matched)).join(', ')}`
    );
  }
}

function parseDateToIso(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function segmentFromIsoDate(isoDate: string | null): '0_90' | '90_365' | '365_plus' {
  if (!isoDate) {
    return '365_plus';
  }

  const date = new Date(isoDate);
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 90) {
    return '0_90';
  }
  if (days <= 365) {
    return '90_365';
  }
  return '365_plus';
}

export function prepareCustomerImportRowsFromCsv(csvText: string): CustomerImportRowDraft[] {
  const { headers, rows } = parseCsvRows(csvText);
  assertNoForbiddenColumns(headers);

  if (!headers.includes('email')) {
    throw new BadRequestException('CSV missing required column: email');
  }

  return rows.map((row, index) => {
    const rowNum = index + 2;
    const email = cleanValue(row.email).toLowerCase();
    const displayName = cleanValue(row.display_name) || null;
    const externalCustomerRef = cleanValue(row.external_customer_ref) || null;
    const lastServiceIso = parseDateToIso(cleanValue(row.last_service_date));

    if (!email) {
      return {
        rowNum,
        rawJson: row,
        normalizedJson: null,
        errorCode: 'MISSING_EMAIL',
        errorMessage: 'Email is required'
      };
    }

    if (cleanValue(row.last_service_date) && !lastServiceIso) {
      return {
        rowNum,
        rawJson: row,
        normalizedJson: null,
        errorCode: 'INVALID_LAST_SERVICE_DATE',
        errorMessage: 'last_service_date is invalid'
      };
    }

    return {
      rowNum,
      rawJson: row,
      normalizedJson: {
        email,
        displayName,
        externalCustomerRef,
        lastServiceDate: lastServiceIso,
        segment: segmentFromIsoDate(lastServiceIso)
      },
      errorCode: null,
      errorMessage: null
    };
  });
}

export function prepareSuppressionImportRowsFromCsv(csvText: string): SuppressionImportRowDraft[] {
  const { headers, rows } = parseCsvRows(csvText);
  assertNoForbiddenColumns(headers);

  if (!headers.includes('email')) {
    throw new BadRequestException('CSV missing required column: email');
  }

  return rows.map((row, index) => {
    const rowNum = index + 2;
    const email = cleanValue(row.email).toLowerCase();
    const channel = cleanValue(row.channel).toLowerCase() || 'email';
    const reason = cleanValue(row.reason) || null;

    if (!email) {
      return {
        rowNum,
        rawJson: row,
        normalizedJson: null,
        errorCode: 'MISSING_EMAIL',
        errorMessage: 'Email is required'
      };
    }

    return {
      rowNum,
      rawJson: row,
      normalizedJson: {
        email,
        channel,
        reason
      },
      errorCode: null,
      errorMessage: null
    };
  });
}
