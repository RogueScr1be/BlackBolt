import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = process.cwd();
const migrationsRoot = resolve(repoRoot, 'prisma/migrations');
const chainFile = resolve(migrationsRoot, '.chain.sha256');

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

function listMigrationFiles() {
  if (!existsSync(migrationsRoot)) return [];
  const entries = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const files = [];
  for (const dir of entries) {
    const file = join(migrationsRoot, dir, 'migration.sql');
    if (existsSync(file)) {
      files.push({ dir, file, rel: `prisma/migrations/${dir}/migration.sql` });
    }
  }
  return files;
}

function computeChainHash() {
  const lines = listMigrationFiles().map(({ rel, file }) => {
    const digest = hashContent(readFileSync(file));
    return `${digest}  ${rel}`;
  });
  const manifest = `${lines.join('\n')}\n`;
  return {
    chainHash: hashContent(manifest),
    manifest
  };
}

function writeChain() {
  const { chainHash } = computeChainHash();
  writeFileSync(chainFile, `${chainHash}\n`);
  console.log(`[check-migration-immutability] wrote ${chainFile}`);
}

function verifyChain() {
  const { chainHash } = computeChainHash();
  if (!existsSync(chainFile)) {
    console.error('[check-migration-immutability] ERROR: prisma/migrations/.chain.sha256 missing');
    process.exit(1);
  }
  const expected = readFileSync(chainFile, 'utf8').trim();
  if (expected !== chainHash) {
    console.error('[check-migration-immutability] ERROR: migration chain hash is stale');
    console.error(`expected: ${expected}`);
    console.error(`actual:   ${chainHash}`);
    console.error('Run: node scripts/check-migration-immutability.mjs --write-chain');
    process.exit(1);
  }
}

function changedMigrationSql(baseSha, headSha) {
  if (!baseSha || !headSha) return [];
  if (/^0+$/.test(baseSha)) return [];
  const output = execSync(`git diff --name-status ${baseSha} ${headSha} -- prisma/migrations`, {
    cwd: repoRoot,
    encoding: 'utf8'
  }).trim();

  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathParts] = line.split(/\s+/);
      const path = pathParts[pathParts.length - 1];
      return { status, path };
    })
    .filter((entry) => entry.path?.startsWith('prisma/migrations/') && entry.path.endsWith('/migration.sql'));
}

function enforceImmutability(baseSha, headSha) {
  if (!baseSha || !headSha || /^0+$/.test(baseSha)) {
    return;
  }
  const changed = changedMigrationSql(baseSha, headSha);
  const nonAdd = changed.filter((entry) => entry.status !== 'A');
  if (nonAdd.length > 0) {
    console.error('[check-migration-immutability] ERROR: existing migration.sql files were modified/renamed/deleted.');
    for (const item of nonAdd) {
      console.error(` - ${item.status} ${item.path}`);
    }
    console.error('Create a new forward migration instead of editing existing migrations.');
    process.exit(1);
  }

  const chainChanged = execSync(`git diff --name-only ${baseSha} ${headSha} -- prisma/migrations/.chain.sha256`, {
    cwd: repoRoot,
    encoding: 'utf8'
  })
    .trim()
    .length > 0;

  if (changed.length > 0 && !chainChanged) {
    console.error('[check-migration-immutability] ERROR: new migration added but prisma/migrations/.chain.sha256 not updated.');
    process.exit(1);
  }

  if (changed.length === 0 && chainChanged) {
    console.error('[check-migration-immutability] ERROR: migration chain hash changed without a migration.sql change.');
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.includes('--write-chain')) {
  writeChain();
  process.exit(0);
}

const [baseSha, headSha] = args;
verifyChain();
if (baseSha && headSha) {
  enforceImmutability(baseSha, headSha);
}
console.log('[check-migration-immutability] OK');
