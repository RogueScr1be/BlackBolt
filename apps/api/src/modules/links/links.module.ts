import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LinksController } from './links.controller';

@Module({
  imports: [PrismaModule],
  controllers: [LinksController]
})
export class LinksModule {}
