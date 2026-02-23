import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function hashOperatorKey(raw: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(raw, salt, 64);
  return `scrypt$v1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function main() {
  const prisma = new PrismaClient();
  const providedName = parseArg('name') ?? 'Demo Tenant';
  const providedSlug = parseArg('slug') ?? slugify(providedName);
  const operatorKey = randomBytes(24).toString('base64url');

  const tenant = await prisma.tenant.upsert({
    where: { slug: providedSlug },
    update: { name: providedName },
    create: {
      slug: providedSlug,
      name: providedName
    }
  });

  await prisma.operatorCredential.upsert({
    where: { tenantId: tenant.id },
    update: {
      keyHash: hashOperatorKey(operatorKey),
      keyHint: operatorKey.slice(-4),
      rotatedAt: new Date(),
      rotatedBy: 'seed-script'
    },
    create: {
      tenantId: tenant.id,
      keyHash: hashOperatorKey(operatorKey),
      keyHint: operatorKey.slice(-4),
      rotatedAt: new Date(),
      rotatedBy: 'seed-script'
    }
  });

  console.log(JSON.stringify({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    operatorKey,
    notes: [
      'Set x-tenant-id to tenantId.',
      'Set x-operator-key to operatorKey.'
    ]
  }, null, 2));

  await prisma.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
