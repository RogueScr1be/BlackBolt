export type ImportStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED';

export type ApiImportStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type ImportErrorSummary = {
  rowNum?: number;
  code: string;
  message: string;
};

export const FORBIDDEN_PHI_COLUMN_TOKENS = [
  'insurance',
  'diagnosis',
  'treatment',
  'note',
  'medical',
  'dob',
  'ssn',
  'patient'
] as const;

export const CSV_LIMIT_BYTES = 5 * 1024 * 1024;
