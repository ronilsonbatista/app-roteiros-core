import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getProviderHealth() {
    let dbStatus = 'HEALTHY';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'UNHEALTHY';
    }

    return {
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      providers: {
        database: {
          name: 'PostgreSQL',
          status: dbStatus,
          configured: true,
        },
        openai: {
          name: 'OpenAI API',
          configured: Boolean(process.env.OPENAI_API_KEY),
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          status: process.env.OPENAI_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        googlePlaces: {
          name: 'Google Places (New)',
          configured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
          status: process.env.GOOGLE_MAPS_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        email: {
          name: 'Resend Email',
          configured: Boolean(process.env.RESEND_API_KEY),
          senderConfigured: Boolean(process.env.EMAIL_FROM),
          marketingCampaignsEnabled: process.env.MARKETING_EMAIL_ENABLED === 'true',
          status: process.env.RESEND_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        mercadoPago: {
          name: 'Mercado Pago (Payments)',
          configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
          webhookConfigured: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
          mocksEnabled: process.env.BILLING_MOCK_PAYMENTS_ENABLED === 'true',
          status: process.env.MERCADO_PAGO_ACCESS_TOKEN ? 'CONFIGURED' : 'NOT_CONFIGURED',
        },
        mediaStorage: {
          name: 'Media Storage',
          provider: process.env.MEDIA_STORAGE_PROVIDER || 'local',
          bucketConfigured: Boolean(process.env.S3_BUCKET),
          status: 'CONFIGURED',
        },
      },
      securityFlags: {
        swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
        mockPaymentsEnabled: process.env.BILLING_MOCK_PAYMENTS_ENABLED === 'true',
        marketingEmailEnabled: process.env.MARKETING_EMAIL_ENABLED === 'true',
      },
    };
  }

  async globalSearch(query: string) {
    if (!query || query.trim().length < 2) {
      return { users: [], trips: [], purchases: [], blogPosts: [], knowledgeArticles: [] };
    }

    const term = query.trim();

    const [users, trips, purchases, blogPosts, knowledgeArticles] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { fullName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { phone: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, fullName: true, email: true, role: true },
      }),
      this.prisma.trip.findMany({
        where: {
          OR: [
            { destination: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, destination: true, status: true },
      }),
      this.prisma.purchase.findMany({
        where: {
          OR: [
            { id: { contains: term, mode: 'insensitive' } },
            { providerPaymentId: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, finalAmount: true, status: true, createdAt: true },
      }),
      this.prisma.blogPost.findMany({
        where: {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { slug: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, slug: true, status: true },
      }),
      this.prisma.knowledgeArticle.findMany({
        where: {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { destination: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, title: true, category: true, destination: true },
      }),
    ]);

    return {
      users,
      trips,
      purchases,
      blogPosts,
      knowledgeArticles,
    };
  }
}
