import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { TripsModule } from './trips/trips.module';
import { TripDaysModule } from './trip-days/trip-days.module';
import { ItineraryModule } from './itinerary/itinerary.module';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { ParticipantsModule } from './participants/participants.module';
import { UserTravelProfileModule } from './user-travel-profile/user-travel-profile.module';
import { PlacesModule } from './places/places.module';
import { MediaModule } from './media/media.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { BillingModule } from './billing/billing.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';
import { PlanningModule } from './planning/planning.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    EmailModule,
    TripsModule,
    TripDaysModule,
    ItineraryModule,
    AdminModule,
    AiModule,
    ParticipantsModule,
    UserTravelProfileModule,
    PlacesModule,
    MediaModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    BillingModule,
    AnalyticsModule,
    HealthModule,
    PlanningModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
