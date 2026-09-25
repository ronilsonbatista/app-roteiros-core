import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { BaseTripsModule } from './base-trips/base-trips.module';
import { AdminTripsController } from './admin-trips.controller';
import { AdminTripsService } from './admin-trips.service';
import { AuditService } from './audit/audit.service';
import { CustomersService } from './customers/customers.service';
import { CustomersController, LeadsController } from './customers/customers.controller';
import { MarketingService } from './marketing/marketing.service';
import {
  MarketingSegmentsController,
  MarketingTemplatesController,
  MarketingCampaignsController,
} from './marketing/marketing.controller';
import { BlogService } from './blog/blog.service';
import { BlogController } from './blog/blog.controller';
import { BlogPublicController } from './blog/blog-public.controller';
import { AiIntelligenceService } from './ai-intelligence/ai-intelligence.service';
import { AiIntelligenceController } from './ai-intelligence/ai-intelligence.controller';
import { SystemService } from './system/system.service';
import { SystemController } from './system/system.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [BaseTripsModule, EmailModule],
  providers: [
    AdminService,
    AdminTripsService,
    AuditService,
    CustomersService,
    MarketingService,
    BlogService,
    AiIntelligenceService,
    SystemService,
  ],
  controllers: [
    AdminController,
    AdminTripsController,
    CustomersController,
    LeadsController,
    MarketingSegmentsController,
    MarketingTemplatesController,
    MarketingCampaignsController,
    BlogController,
    BlogPublicController,
    AiIntelligenceController,
    SystemController,
  ],
  exports: [
    AuditService,
    CustomersService,
    MarketingService,
    BlogService,
    AiIntelligenceService,
    SystemService,
  ],
})
export class AdminModule {}
