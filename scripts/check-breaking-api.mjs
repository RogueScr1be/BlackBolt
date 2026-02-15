#!/usr/bin/env node
import { resolve } from 'node:path';

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

const baseSpec = resolve(readArg('--base', 'contracts/openapi/blackbolt.v1.yaml'));
const headSpec = resolve(readArg('--head', 'contracts/openapi/blackbolt.v1.yaml'));

console.log('[check-breaking-api] interface ready');
console.log(`  base: ${baseSpec}`);
console.log(`  head: ${headSpec}`);
console.log('[check-breaking-api] NYI: breaking-change engine not implemented yet');
console.log('[check-breaking-api] Placeholder passes for now.');
process.exit(0);
