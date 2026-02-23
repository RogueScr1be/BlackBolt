import { Module } from '@nestjs/common';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BootstrapController } from './bootstrap.controller';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [PrismaModule, OperatorCredentialsModule],
  controllers: [BootstrapController],
  providers: [BootstrapService]
})
export class BootstrapModule {}
