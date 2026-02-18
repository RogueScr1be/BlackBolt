import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { QueuesModule } from './modules/queues/queues.module';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppressionsModule } from './modules/suppressions/suppressions.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { PostmarkModule } from './modules/postmark/postmark.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { OperatorModule } from './modules/operator/operator.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EventsModule } from './modules/events/events.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { OperatorTenantsModule } from './modules/operator-tenants/operator-tenants.module';
import { OperatorCredentialsModule } from './modules/operator-credentials/operator-credentials.module';
import { CampaignRunsModule } from './modules/campaign-runs/campaign-runs.module';
import { LinksModule } from './modules/links/links.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SosModule } from './modules/sos/sos.module';

@Module({
  imports: [
    HealthModule,
    AuthModule,
    TenantsModule,
    TenancyModule,
    PrismaModule,
    QueuesModule,
    CustomersModule,
    SuppressionsModule,
    IntegrationsModule,
    ReviewsModule,
    PostmarkModule,
    RevenueModule,
    OperatorModule,
    DashboardModule,
    EventsModule,
    AlertsModule,
    OperatorTenantsModule,
    OperatorCredentialsModule,
    CampaignRunsModule,
    LinksModule,
    ReportsModule,
    SosModule
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor
    }
  ]
})
export class AppModule {}
