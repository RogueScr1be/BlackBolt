import { Injectable } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const HASH_PREFIX = 'scrypt$v1';

function toHint(key: string) {
  const normalized = key.trim();
  return normalized.length <= 4 ? normalized : normalized.slice(-4);
}

function hashOperatorKey(raw: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(raw, salt, 64);
  return `${HASH_PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyOperatorKey(raw: string, encoded: string): boolean {
  const [prefix, version, saltHex, hashHex] = encoded.split('$');
  if (`${prefix}$${version}` !== HASH_PREFIX || !saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(raw, salt, expected.length);
  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}

@Injectable()
export class OperatorCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  generateOperatorKey(): string {
    return randomBytes(24).toString('base64url');
  }

  async upsertKey(input: { tenantId: string; keyPlaintext: string; rotatedBy?: string | null }) {
    const keyHash = hashOperatorKey(input.keyPlaintext);
    const keyHint = toHint(input.keyPlaintext);
    await this.prisma.operatorCredential.upsert({
      where: { tenantId: input.tenantId },
      update: {
        keyHash,
        keyHint,
        rotatedAt: new Date(),
        rotatedBy: input.rotatedBy ?? null
      },
      create: {
        tenantId: input.tenantId,
        keyHash,
        keyHint,
        rotatedAt: new Date(),
        rotatedBy: input.rotatedBy ?? null
      }
    });
  }

  async verifyKey(input: { tenantId: string; keyPlaintext: string }): Promise<boolean> {
    const row = await this.prisma.operatorCredential.findUnique({
      where: { tenantId: input.tenantId },
      select: { keyHash: true }
    });

    if (!row) {
      return false;
    }

    return verifyOperatorKey(input.keyPlaintext, row.keyHash);
  }

  async verifyPortfolioKey(input: { keyPlaintext: string }): Promise<{
    credentialId: string;
    tenantIds: string[];
  } | null> {
    const rows = await this.prisma.operatorPortfolioCredential.findMany({
      where: { active: true },
      select: {
        id: true,
        keyHash: true,
        memberships: {
          select: {
            tenantId: true
          }
        }
      },
      take: 1000
    });

    for (const row of rows) {
      if (!verifyOperatorKey(input.keyPlaintext, row.keyHash)) {
        continue;
      }
      const tenantIds = [...new Set(row.memberships.map((membership) => membership.tenantId))];
      return {
        credentialId: row.id,
        tenantIds
      };
    }

    return null;
  }

  async upsertPortfolioCredential(input: {
    keyPlaintext: string;
    label?: string | null;
    active?: boolean;
    rotatedBy?: string | null;
    tenantIds: string[];
    credentialId?: string;
  }) {
    const keyHash = hashOperatorKey(input.keyPlaintext);
    const keyHint = toHint(input.keyPlaintext);
    const tenantIds = [...new Set(input.tenantIds)];

    if (input.credentialId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.operatorPortfolioCredential.update({
          where: { id: input.credentialId },
          data: {
            label: input.label ?? null,
            active: input.active ?? true,
            keyHash,
            keyHint,
            rotatedAt: new Date(),
            rotatedBy: input.rotatedBy ?? null
          }
        });

        await tx.operatorPortfolioTenantMembership.deleteMany({
          where: { credentialId: input.credentialId }
        });

        if (tenantIds.length > 0) {
          await tx.operatorPortfolioTenantMembership.createMany({
            data: tenantIds.map((tenantId) => ({
              credentialId: input.credentialId!,
              tenantId
            }))
          });
        }
      });

      return { credentialId: input.credentialId, keyHint };
    }

    const created = await this.prisma.operatorPortfolioCredential.create({
      data: {
        label: input.label ?? null,
        active: input.active ?? true,
        keyHash,
        keyHint,
        rotatedAt: new Date(),
        rotatedBy: input.rotatedBy ?? null,
        memberships:
          tenantIds.length > 0
            ? {
                create: tenantIds.map((tenantId) => ({ tenantId }))
              }
            : undefined
      },
      select: { id: true }
    });

    return { credentialId: created.id, keyHint };
  }
}
