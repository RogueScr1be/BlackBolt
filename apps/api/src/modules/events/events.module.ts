import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperatorCredentialsModule } from '../operator-credentials/operator-credentials.module';
import { OperatorKeyGuard } from '../../common/guards/operator-key.guard';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [PrismaModule, TenancyModule, OperatorCredentialsModule],
  controllers: [EventsController],
  providers: [EventsService, OperatorKeyGuard]
})
export class EventsModule {}
