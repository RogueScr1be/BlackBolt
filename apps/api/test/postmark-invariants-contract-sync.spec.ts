import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  POSTMARK_INVARIANT_CODES,
  POSTMARK_INVARIANT_UNKNOWN_CODE
} from '../src/modules/postmark/postmark.constants';

function extractInvariantEnum(yaml: string): string[] {
  const schemaBlockMatch = yaml.match(/PostmarkInvariantBreach:[\s\S]*?(?:\n\S|$)/);
  if (!schemaBlockMatch) return [];
  const schemaBlock = schemaBlockMatch[0];
  const enumBlockMatch = schemaBlock.match(/code:[\s\S]*?enum:\s*([\s\S]*?)\n\s{8}[a-zA-Z]/);
  if (!enumBlockMatch) return [];

  return enumBlockMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

describe('Postmark invariant OpenAPI/runtime sync', () => {
  it('keeps OpenAPI enum in sync with runtime invariant codes', () => {
    const specPath = resolve(__dirname, '../../../contracts/openapi/blackbolt.v1.yaml');
    const spec = readFileSync(specPath, 'utf8');
    const openapiCodes = extractInvariantEnum(spec);

    expect(openapiCodes).toEqual([...POSTMARK_INVARIANT_CODES, POSTMARK_INVARIANT_UNKNOWN_CODE]);
  });
});
