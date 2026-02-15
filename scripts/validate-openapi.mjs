#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const specPath = resolve('contracts/openapi/blackbolt.v1.yaml');
const rulesetPath = resolve('.spectral.yaml');
const offline = process.env.TEST_OFFLINE === '1';

if (offline) {
  console.log('[validate-openapi] TEST_OFFLINE=1 -> skipping Spectral lint');
  process.exit(0);
}

if (!existsSync(specPath)) {
  console.error(`OpenAPI spec not found: ${specPath}`);
  process.exit(1);
}

if (!existsSync(rulesetPath)) {
  console.error(`Spectral ruleset not found: ${rulesetPath}`);
  process.exit(1);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  cmd,
  ['--yes', '@stoplight/spectral-cli@6.11.0', 'lint', specPath, '--ruleset', rulesetPath],
  {
  stdio: 'inherit'
  }
);

process.exit(result.status ?? 1);
