#!/usr/bin/env node
import { execSync } from 'node:child_process';

const output = execSync('git ls-files', { encoding: 'utf8' });
const tracked = output
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const offenders = tracked.filter((path) => /(^|\/).+ 2(\.[^/]+)?$/.test(path));

if (offenders.length > 0) {
  console.error('[dup-check] Found tracked duplicate-suffixed files:');
  offenders.forEach((path) => console.error(`- ${path}`));
  process.exit(1);
}

console.log('[dup-check] OK (no tracked duplicate-suffixed files)');
