#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaPath = resolve('prisma/schema.prisma');
const stampPath = resolve('prisma/schema.prisma.sha256');
const checkMode = process.argv.includes('--check');

const schema = readFileSync(schemaPath, 'utf8');
const hash = createHash('sha256').update(schema).digest('hex');

if (checkMode) {
  if (!existsSync(stampPath)) {
    console.error(`[prisma-hash] missing stamp file: ${stampPath}`);
    process.exit(1);
  }

  const current = readFileSync(stampPath, 'utf8').trim();
  if (current !== hash) {
    console.error('[prisma-hash] schema hash mismatch. Run: npm run prisma:generate');
    console.error(`  expected: ${hash}`);
    console.error(`  found:    ${current}`);
    process.exit(1);
  }

  console.log('[prisma-hash] schema hash is up to date');
  process.exit(0);
}

writeFileSync(stampPath, `${hash}\n`);
console.log(`[prisma-hash] wrote ${stampPath}`);
