#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceSpec = resolve('contracts/openapi/blackbolt.v1.yaml');
const packageRoot = resolve('clients/swift/BlackBoltAPI');
const targetSpec = resolve('clients/swift/BlackBoltAPI/openapi.yaml');
const configPath = resolve('clients/swift/BlackBoltAPI/openapi-generator-config.yaml');
const outputDir = resolve('clients/swift/BlackBoltAPI/Sources/BlackBoltAPI');
const minSwift = { major: 6, minor: 2, patch: 3 };

function parseSwiftVersion(output) {
  const match = output.match(/Apple Swift version\s+(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function isVersionAtLeast(current, minimum) {
  if (current.major !== minimum.major) return current.major > minimum.major;
  if (current.minor !== minimum.minor) return current.minor > minimum.minor;
  return current.patch >= minimum.patch;
}

if (!existsSync(sourceSpec)) {
  console.error(`[swift:generate] source spec missing: ${sourceSpec}`);
  process.exit(1);
}

if (!existsSync(configPath)) {
  console.error(`[swift:generate] config missing: ${configPath}`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
copyFileSync(sourceSpec, targetSpec);
console.log(`[swift:generate] synced OpenAPI spec to ${targetSpec}`);

const swiftVersion = spawnSync('swift', ['--version'], { encoding: 'utf8' });
if (swiftVersion.status !== 0) {
  console.error('[swift:generate] swift toolchain not available');
  process.exit(1);
}

const versionOutput = swiftVersion.stdout.trim();
const parsed = parseSwiftVersion(versionOutput);
if (!parsed) {
  console.error('[swift:generate] failed to parse Swift version output');
  console.error(versionOutput);
  process.exit(1);
}

if (!isVersionAtLeast(parsed, minSwift)) {
  console.error(
    `[swift:generate] Swift ${parsed.major}.${parsed.minor}.${parsed.patch} is below required ${minSwift.major}.${minSwift.minor}.${minSwift.patch}`
  );
  process.exit(1);
}

console.log(versionOutput);

// Remove plugin-era source-local inputs to keep build hot path plugin-free.
rmSync(resolve(outputDir, 'openapi.yaml'), { force: true });
rmSync(resolve(outputDir, 'openapi.yml'), { force: true });
rmSync(resolve(outputDir, 'openapi.json'), { force: true });
rmSync(resolve(outputDir, 'openapi-generator-config.yaml'), { force: true });

// Apple Swift OpenAPI Generator executable via SwiftPM (script/CI path only).
const gen = spawnSync(
  'swift',
  [
    'run',
    '--package-path',
    packageRoot,
    'swift-openapi-generator',
    'generate',
    '--config',
    configPath,
    '--output-directory',
    outputDir,
    targetSpec
  ],
  { stdio: 'inherit' }
);

if (gen.status !== 0) {
  process.exit(gen.status ?? 1);
}

console.log('[swift:generate] generation complete');
