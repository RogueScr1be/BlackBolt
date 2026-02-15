#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const specPath = resolve('contracts/openapi/blackbolt.v1.yaml');
const routeManifestPath = resolve('apps/api/src/openapi-route-manifest.ts');

function extractOperationIdsFromSpec(source) {
  const matches = source.matchAll(/^\s*operationId:\s*([A-Za-z0-9_\-]+)/gm);
  return new Set(Array.from(matches, (match) => match[1]));
}

function extractOperationIdsFromManifest(source) {
  const blockMatch = source.match(/OPENAPI_OPERATION_IDS\s*=\s*\[(.*?)\]\s*as const/s);
  if (!blockMatch) {
    throw new Error('OPENAPI_OPERATION_IDS array not found in route manifest');
  }

  const quoted = blockMatch[1].matchAll(/['"]([A-Za-z0-9_\-]+)['"]/g);
  return new Set(Array.from(quoted, (match) => match[1]));
}

try {
  const specRaw = readFileSync(specPath, 'utf8');
  const manifestRaw = readFileSync(routeManifestPath, 'utf8');

  const specIds = extractOperationIdsFromSpec(specRaw);
  const routeIds = extractOperationIdsFromManifest(manifestRaw);

  const missingInServer = Array.from(specIds).filter((id) => !routeIds.has(id));
  const missingInSpec = Array.from(routeIds).filter((id) => !specIds.has(id));

  if (missingInServer.length > 0 || missingInSpec.length > 0) {
    console.error('[check-openapi-coverage] operationId coverage mismatch');
    if (missingInServer.length > 0) {
      console.error(`  Missing in server manifest: ${missingInServer.join(', ')}`);
    }
    if (missingInSpec.length > 0) {
      console.error(`  Missing in OpenAPI spec: ${missingInSpec.join(', ')}`);
    }
    process.exit(1);
  }

  console.log(`[check-openapi-coverage] OK (${specIds.size} operationIds matched)`);
  process.exit(0);
} catch (error) {
  console.error('[check-openapi-coverage] failed to evaluate coverage');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
