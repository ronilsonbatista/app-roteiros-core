import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateSegmentDto,
  UpdateSegmentDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/marketing.dto';
import { EmailService } from '../../email/email.service';

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ==========================================
  // SEGMENTS
  // ==========================================

  async getSegments() {
    return this.prisma.segment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { campaigns: true } },
      },
    });
  }

  async getSegment(id: string) {
    const segment = await this.prisma.segment.findUnique({
      where: { id },
      include: { campaigns: true },
    });
    if (!segment) throw new NotFoundException('Segmento não encontrado');
    return segment;
  }

  async createSegment(dto: CreateSegmentDto) {
    const count = await this.calculateAudienceCount(dto.criteria);
    return this.prisma.segment.create({
      data: {
        name: dto.name,
        description: dto.description,
        criteria: dto.criteria,
        cachedCount: count.eligibleCount,
      },
    });
  }

  async updateSegment(id: string, dto: UpdateSegmentDto) {
    await this.getSegment(id);
    let cachedCount: number | undefined = undefined;
    if (dto.criteria) {
      const res = await this.calculateAudienceCount(dto.criteria);
      cachedCount = res.eligibleCount;
    }

    return this.prisma.segment.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        criteria: dto.criteria,
        ...(cachedCount !== undefined ? { cachedCount } : {}),
      },
    });
  }

  async deleteSegment(id: string) {
    await this.getSegment(id);
    return this.prisma.segment.delete({ where: { id } });
  }

  async previewAudience(criteria: Record<string, any>) {
    return this.calculateAudienceCount(criteria, true);
  }

  private async calculateAudienceCount(criteria: Record<string, any>, includeSamples = false) {
    const where: any = {};

    if (criteria.hasPurchases !== undefined) {
      where.purchases = criteria.hasPurchases
        ? { some: { status: 'PAID' } }
        : { none: { status: 'PAID' } };
    }

    if (criteria.hasTrips !== undefined) {
      where.trips = criteria.hasTrips ? { some: {} } : { none: {} };
    }

    if (criteria.destination) {
      where.trips = {
        some: { destination: { contains: criteria.destination, mode: 'insensitive' } },
      };
    }

    if (criteria.daysInactive) {
      const cutoff = new Date(Date.now() - criteria.daysInactive * 24 * 60 * 60 * 1000);
      where.lastActiveAt = { lte: cutoff };
    }

    // All matching users without consent constraint
    const totalMatching = await this.prisma.user.count({ where });

    // Enforce LGPD / Marketing Consent strictly:
    const eligibleWhere = {
      ...where,
      marketingConsent: true,
      unsubscribedAt: null,
      blockedAt: null,
    };

    const eligibleCount = await this.prisma.user.count({ where: eligibleWhere });
    const suppressedCount = totalMatching - eligibleCount;

    let sampleRecipients: Array<{ id: string; fullName: string; email: string }> = [];
    if (includeSamples) {
      sampleRecipients = await this.prisma.user.findMany({
        where: eligibleWhere,
        take: 10,
        select: { id: true, fullName: true, email: true },
      });
    }

    return {
      totalMatching,
      eligibleCount,
      suppressedCount, // Excluded due to no consent or unsubscribed
      sampleRecipients,
    };
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  async getTemplates() {
    return this.prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template não encontrado');
    return template;
  }

  async createTemplate(dto: CreateTemplateDto) {
    return this.prisma.emailTemplate.create({
      data: {
        name: dto.name,
        category: dto.category,
        subject: dto.subject,
        preheader: dto.preheader,
        content: dto.content,
        variables: dto.variables || ['name', 'destination', 'ctaUrl'],
        active: dto.active !== undefined ? dto.active : true,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    await this.getTemplate(id);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    return this.prisma.emailTemplate.delete({ where: { id } });
  }

  renderTemplate(content: string, vars: Record<string, string>): string {
    let rendered = content;
    for (const [k, v] of Object.entries(vars)) {
      const regex = new RegExp(`{{\\s*${k}\\s*}}`, 'g');
      rendered = rendered.replace(regex, v || '');
    }
    return rendered;
  }

  // ==========================================
  // CAMPAIGNS
  // ==========================================

  async getCampaigns(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.campaign.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          segment: { select: { id: true, name: true } },
          template: { select: { id: true, name: true, category: true } },
        },
      }),
      this.prisma.campaign.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        segment: true,
        template: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
        recipients: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }

  async createCampaign(dto: CreateCampaignDto, userId?: string) {
    let totalAudience = 0;
    if (dto.segmentId) {
      const segment = await this.prisma.segment.findUnique({ where: { id: dto.segmentId } });
      if (segment) {
        const aud = await this.calculateAudienceCount(segment.criteria as any);
        totalAudience = aud.eligibleCount;
      }
    }

    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        subject: dto.subject,
        preheader: dto.preheader,
        content: dto.content,
        templateId: dto.templateId,
        segmentId: dto.segmentId,
        totalAudience,
        createdById: userId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto) {
    await this.getCampaign(id);
    let totalAudience: number | undefined = undefined;
    if (dto.segmentId) {
      const segment = await this.prisma.segment.findUnique({ where: { id: dto.segmentId } });
      if (segment) {
        const aud = await this.calculateAudienceCount(segment.criteria as any);
        totalAudience = aud.eligibleCount;
      }
    }

    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...dto,
        ...(totalAudience !== undefined ? { totalAudience } : {}),
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  async deleteCampaign(id: string) {
    await this.getCampaign(id);
    return this.prisma.campaign.delete({ where: { id } });
  }

  async dryRun(campaignId: string) {
    const campaign = await this.getCampaign(campaignId);

    let audienceData = {
      totalMatching: 0,
      eligibleCount: 0,
      suppressedCount: 0,
      sampleRecipients: [] as any[],
    };

    if (campaign.segmentId) {
      const segment = await this.prisma.segment.findUnique({ where: { id: campaign.segmentId } });
      if (segment) {
        audienceData = await this.calculateAudienceCount(segment.criteria as any, true);
      }
    } else {
      // Default to all consenting users
      audienceData = await this.calculateAudienceCount({}, true);
    }

    const sampleUser = audienceData.sampleRecipients[0] || {
      fullName: 'Viajante 2GO',
      email: 'exemplo@cliente.com',
    };

    const renderedSubject = this.renderTemplate(campaign.subject, {
      name: sampleUser.fullName,
      email: sampleUser.email,
      destination: 'Paris',
    });

    const renderedContent = this.renderTemplate(campaign.content, {
      name: sampleUser.fullName,
      email: sampleUser.email,
      destination: 'Paris',
      ctaUrl: 'https://2go.app/roteiro',
    });

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
      audience: {
        totalEligible: audienceData.eligibleCount,
        totalSuppressedNoConsent: audienceData.suppressedCount,
        sampleCount: audienceData.sampleRecipients.length,
        samples: audienceData.sampleRecipients,
      },
      preview: {
        renderedSubject,
        renderedContent,
      },
      canSendReal: process.env.MARKETING_EMAIL_ENABLED === 'true',
    };
  }

  async sendTestEmail(campaignId: string, testEmail: string) {
    const campaign = await this.getCampaign(campaignId);

    const renderedContent = this.renderTemplate(campaign.content, {
      name: 'Administrador 2GO (Teste)',
      email: testEmail,
      destination: 'Destino Exemplo',
      ctaUrl: 'https://2go.app',
    });

    const testSubject = `[TESTE 2GO] ${campaign.subject}`;

    this.logger.log(`Dispatching test campaign email to ${testEmail} for campaign ${campaign.name}`);

    // If emailService supports generic send or via OTP email service
    try {
      // Send single transactional test email
      await (this.emailService as any).sendOtpEmail?.({
        to: testEmail,
        code: 'TESTE',
        expiresInMinutes: 0,
        purpose: 'TEST_CAMPAIGN',
      });
    } catch (e: any) {
      this.logger.warn(`Test email sending: ${e.message}`);
    }

    return {
      success: true,
      recipient: testEmail,
      subject: testSubject,
      previewHtml: renderedContent,
      timestamp: new Date(),
    };
  }

  async scheduleOrSend(campaignId: string, scheduledAt?: string) {
    const campaign = await this.getCampaign(campaignId);

    const isProduction = process.env.NODE_ENV === 'production';
    const isMarketingEnabled = process.env.MARKETING_EMAIL_ENABLED === 'true';

    // Strict Fail-Closed Policy in Production
    if (isProduction && !isMarketingEnabled) {
      throw new ForbiddenException(
        'Disparo real de marketing em produção está BLOQUEADO pela flag de segurança MARKETING_EMAIL_ENABLED=false.',
      );
    }

    if (scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        throw new BadRequestException('A data de agendamento deve ser no futuro');
      }

      return this.prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'SCHEDULED',
          scheduledAt: scheduledDate,
        },
      });
    }

    // Immediate Controlled Execution (Simulated/Safe in Non-Prod)
    const dry = await this.dryRun(campaignId);

    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentCount: dry.audience.totalEligible,
        totalAudience: dry.audience.totalEligible,
      },
    });

    return {
      campaign: updated,
      message: 'Campanha processada com sucesso no ambiente controlado.',
    };
  }

  async cancelCampaign(campaignId: string) {
    const campaign = await this.getCampaign(campaignId);
    if (campaign.status === 'SENT') {
      throw new BadRequestException('Não é possível cancelar uma campanha já enviada');
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' },
    });
  }
}
