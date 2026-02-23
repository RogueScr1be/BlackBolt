import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Controller('v1/links')
export class LinksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':code')
  async redirect(@Param('code') code: string, @Req() req: Request, @Res() res: Response) {
    const row = await this.prisma.linkCode.findFirst({
      where: { code },
      select: {
        id: true,
        tenantId: true,
        destinationUrl: true,
        campaignMessageId: true
      }
    });

    if (!row) {
      throw new NotFoundException('Link not found');
    }

    const userAgent = req.headers['user-agent'];
    const ip = req.ip ?? req.socket.remoteAddress ?? null;
    const ipHash = ip ? createHash('sha256').update(ip).digest('hex') : null;

    await this.prisma.clickEvent.create({
      data: {
        tenantId: row.tenantId,
        linkCodeId: row.id,
        userAgent: typeof userAgent === 'string' ? userAgent : null,
        ipHash
      }
    });

    const providerEventId = `link:${row.id}:${Date.now()}`;
    await this.prisma.sendEvent.upsert({
      where: {
        tenantId_providerEventId_eventType: {
          tenantId: row.tenantId,
          providerEventId,
          eventType: 'click'
        }
      },
      update: {},
      create: {
        tenantId: row.tenantId,
        campaignMessageId: row.campaignMessageId,
        provider: 'BLACKBOLT_LINK',
        providerEventId,
        providerMessageId: null,
        eventType: 'click',
        occurredAt: new Date()
      }
    });

    return res.redirect(302, row.destinationUrl);
  }
}
