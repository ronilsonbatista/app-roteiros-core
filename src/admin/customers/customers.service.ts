import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersQueryDto, LeadsQueryDto } from './dto/customers.dto';

export interface CustomerLifecycleMetrics {
  totalSpent: number;
  totalTrips: number;
  totalPurchases: number;
  stage: 'CUSTOMER' | 'PROSPECT' | 'ACTIVE_USER' | 'CHURNED';
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomers(query: CustomersQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.hasConsent !== undefined) {
      where.marketingConsent = query.hasConsent;
    }

    if (query.destination) {
      where.trips = {
        some: {
          destination: { contains: query.destination, mode: 'insensitive' },
        },
      };
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    if (query.hasTrips !== undefined) {
      where.trips = query.hasTrips ? { some: {} } : { none: {} };
    }

    if (query.hasPurchases !== undefined) {
      where.purchases = query.hasPurchases
        ? { some: { status: 'PAID' } }
        : { none: { status: 'PAID' } };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { trips: true, purchases: true },
          },
          purchases: {
            where: { status: 'PAID' },
            select: { finalAmount: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const data = users.map((u) => {
      const totalSpent = u.purchases.reduce(
        (acc, p) => acc + Number(p.finalAmount || 0),
        0,
      );

      let stage: 'CUSTOMER' | 'PROSPECT' | 'ACTIVE_USER' | 'CHURNED' = 'ACTIVE_USER';
      if (totalSpent > 0 || u._count.purchases > 0) {
        stage = 'CUSTOMER';
      } else if (u._count.trips > 0) {
        stage = 'PROSPECT';
      } else if (u.createdAt < sixtyDaysAgo) {
        stage = 'CHURNED';
      } else if (u.createdAt >= thirtyDaysAgo) {
        stage = 'ACTIVE_USER';
      }

      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        origin: u.origin || 'mobile',
        marketingConsent: u.marketingConsent,
        emailConfirmed: u.emailConfirmed,
        blockedAt: u.blockedAt,
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt || u.updatedAt,
        totalTrips: u._count.trips,
        totalPurchases: u._count.purchases,
        totalSpent,
        stage,
      };
    });

    const filteredData = query.stage && query.stage !== 'ALL'
      ? data.filter((item) => item.stage === query.stage)
      : data;

    return {
      data: filteredData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCustomer360(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        travelProfile: true,
        trips: {
          orderBy: { createdAt: 'desc' },
          include: {
            days: {
              include: {
                _count: { select: { items: true } },
              },
            },
          },
        },
        purchases: {
          orderBy: { createdAt: 'desc' },
          include: {
            product: true,
            coupon: true,
          },
        },
        claimedGuestJourneys: {
          orderBy: { createdAt: 'desc' },
        },
        aiRequests: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        campaignRecipients: {
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: {
              select: { id: true, name: true, subject: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Cliente com ID ${id} não encontrado`);
    }

    // Build Chronological Timeline from actual system events
    const timeline: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      timestamp: Date;
      metadata?: any;
    }> = [];

    // 1. Account Creation
    timeline.push({
      id: `acc_${user.id}`,
      type: 'ACCOUNT_CREATED',
      title: 'Conta Criada',
      description: `Cadastro via ${user.origin || 'aplicativo'} (${user.email})`,
      timestamp: user.createdAt,
    });

    // 2. Travel Profile
    if (user.travelProfile) {
      timeline.push({
        id: `prof_${user.travelProfile.id}`,
        type: 'PROFILE_COMPLETED',
        title: 'Perfil de Viajante Concluído',
        description: `Estilos: ${user.travelProfile.preferredStyles?.join(', ') || 'Geral'}`,
        timestamp: user.travelProfile.createdAt,
      });
    }

    // 3. Claimed Journeys
    user.claimedGuestJourneys.forEach((j) => {
      timeline.push({
        id: `journey_${j.id}`,
        type: 'GUEST_JOURNEY_CLAIMED',
        title: 'Roteiro Anônimo Reivindicado',
        description: `Jornada ${j.id.slice(0, 8)} convertida em viagem relacional`,
        timestamp: j.updatedAt,
      });
    });

    // 4. Trips
    user.trips.forEach((t) => {
      timeline.push({
        id: `trip_${t.id}`,
        type: 'TRIP_CREATED',
        title: `Viagem Criada: ${t.destination}`,
        description: `${t.title} (${t.days.length} dias cadastrados)`,
        timestamp: t.createdAt,
        metadata: { tripId: t.id },
      });

      if (t.premiumUnlockedAt) {
        timeline.push({
          id: `premium_${t.id}`,
          type: 'TRIP_PREMIUM_UNLOCKED',
          title: `Roteiro Desbloqueado: ${t.destination}`,
          description: 'Acesso completo ao roteiro liberado',
          timestamp: t.premiumUnlockedAt,
        });
      }
    });

    // 5. Purchases
    user.purchases.forEach((p) => {
      timeline.push({
        id: `purch_${p.id}`,
        type: p.status === 'PAID' ? 'PAYMENT_COMPLETED' : 'CHECKOUT_STARTED',
        title:
          p.status === 'PAID'
            ? `Pagamento Aprovado: ${p.product?.name || 'Roteiro'}`
            : `Checkout Iniciado (${p.status})`,
        description: `Valor: R$ ${Number(p.finalAmount).toFixed(2)} via ${p.paymentMethod || 'gateway'}`,
        timestamp: p.paidAt || p.createdAt,
        metadata: { purchaseId: p.id, status: p.status },
      });
    });

    // 6. Campaign communications
    user.campaignRecipients.forEach((c) => {
      timeline.push({
        id: `camp_${c.id}`,
        type: 'COMMUNICATION_RECEIVED',
        title: `Campanha Recebida: ${c.campaign.name}`,
        description: `Assunto: "${c.campaign.subject}" (Status: ${c.status})`,
        timestamp: c.sentAt || c.createdAt,
      });
    });

    // Sort timeline chronological descending
    timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const totalSpent = user.purchases
      .filter((p) => p.status === 'PAID')
      .reduce((acc, p) => acc + Number(p.finalAmount || 0), 0);

    return {
      profile: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        photoUrl: user.photoUrl,
        origin: user.origin,
        marketingConsent: user.marketingConsent,
        marketingConsentAt: user.marketingConsentAt,
        unsubscribedAt: user.unsubscribedAt,
        emailConfirmed: user.emailConfirmed,
        blockedAt: user.blockedAt,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt || user.updatedAt,
      },
      metrics: {
        totalSpent,
        totalTrips: user.trips.length,
        totalPurchases: user.purchases.length,
        totalAIRequests: user.aiRequests.length,
      },
      travelProfile: user.travelProfile,
      trips: user.trips.map((t) => ({
        id: t.id,
        title: t.title,
        destination: t.destination,
        coverImage: t.coverImage,
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
        dayCount: t.days.length,
        itemCount: t.days.reduce((acc, d) => acc + (d._count?.items || 0), 0),
        premiumUnlockedAt: t.premiumUnlockedAt,
        createdAt: t.createdAt,
      })),
      purchases: user.purchases.map((p) => ({
        id: p.id,
        productName: p.product?.name,
        productType: p.product?.type,
        amount: Number(p.amount),
        discountAmount: Number(p.discountAmount),
        finalAmount: Number(p.finalAmount),
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        paymentMethod: p.paymentMethod,
        providerPaymentId: p.providerPaymentId,
        couponCode: p.coupon?.code,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      guestJourneys: user.claimedGuestJourneys.map((j) => ({
        id: j.id,
        status: j.status,
        currentStep: j.currentStep,
        destinations: j.destinations,
        travelStyle: j.travelStyle,
        budgetLevel: j.budgetLevel,
        createdAt: j.createdAt,
      })),
      timeline,
    };
  }

  async updateConsent(id: string, consent: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        marketingConsent: consent,
        marketingConsentAt: consent ? new Date() : user.marketingConsentAt,
        unsubscribedAt: consent ? null : new Date(),
      },
    });

    return {
      id: updated.id,
      marketingConsent: updated.marketingConsent,
      marketingConsentAt: updated.marketingConsentAt,
      unsubscribedAt: updated.unsubscribedAt,
    };
  }

  async getLeads(query: LeadsQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;

    const [leads, total] = await Promise.all([
      this.prisma.guestJourney.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          claimedUser: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.guestJourney.count({ where }),
    ]);

    return {
      data: leads.map((l) => ({
        id: l.id,
        status: l.status,
        currentStep: l.currentStep,
        destinations: l.destinations,
        travelers: l.travelers,
        travelStyle: l.travelStyle,
        budgetLevel: l.budgetLevel,
        hasGeneratedItinerary: Boolean(l.generatedItinerary),
        claimedUser: l.claimedUser,
        generationErrorCode: l.generationErrorCode,
        createdAt: l.createdAt,
        expiresAt: l.expiresAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getLeadDetails(id: string) {
    const lead = await this.prisma.guestJourney.findUnique({
      where: { id },
      include: {
        claimedUser: true,
        aiRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) throw new NotFoundException('Lead / Jornada não encontrada');

    return lead;
  }
}
