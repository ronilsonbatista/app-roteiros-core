import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseTripStatus, ItineraryCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { OpenAIProvider } from '../ai/providers/openai.provider';
import { CurationRetrievalService } from '../ai/curation/curation-retrieval.service';

@Injectable()
export class ItineraryEditorService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private provider: OpenAIProvider,
    private curation: CurationRetrievalService,
  ) {}

  async generateTrip(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Viagem não encontrada');
    return this.ai.generateItinerary(trip.userId, id, {});
  }

  async generateBaseTrip(id: string) {
    const trip = await this.prisma.baseTrip.findUnique({
      where: { id },
      include: { days: true },
    });
    if (!trip) throw new NotFoundException('Roteiro base não encontrado');
    if (trip.status !== BaseTripStatus.DRAFT || trip.days.length) {
      throw new BadRequestException(
        'A IA só preenche rascunhos sem dias. Edite o conteúdo existente manualmente.',
      );
    }
    if (trip.numberOfDays < 1 || trip.numberOfDays > 30)
      throw new BadRequestException('Informe de 1 a 30 dias.');
    const context = await this.curation.retrieveCuratedContext({
      destinations: [{ name: trip.destination, city: trip.city || undefined }],
      numberOfDays: trip.numberOfDays,
      interests: trip.tags,
    });
    const result = await this.provider.generateItinerary({
      destination: trip.destination,
      numberOfDays: trip.numberOfDays,
      travelProfile: {
        profile: trip.profile,
        interests: trip.tags,
        editorialBrief: trip.fullDescription || trip.shortDescription,
        currency: trip.currency,
      },
      baseTrip: context.destinations[0]?.bestBaseTrip?.baseTrip,
    });
    const days = result.parsedData?.days;
    if (
      !Array.isArray(days) ||
      days.length !== trip.numberOfDays ||
      days.some(
        (day) =>
          !Array.isArray(day.items) ||
          !day.items.length ||
          day.items.length > 30 ||
          day.items.some(
            (item: { title?: unknown }) =>
              typeof item.title !== 'string' || !item.title.trim(),
          ),
      )
    ) {
      throw new BadRequestException(
        'A IA retornou um roteiro incompleto. Nada foi salvo; tente novamente.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.baseTrip.findUnique({
        where: { id },
        include: { days: true },
      });
      if (
        !current ||
        current.status !== BaseTripStatus.DRAFT ||
        current.days.length ||
        current.updatedAt.getTime() !== trip.updatedAt.getTime()
      )
        throw new BadRequestException(
          'O roteiro foi alterado durante a geração. Atualize a página.',
        );
      await tx.baseTrip.update({
        where: { id },
        data: {
          days: {
            create: days.map((day, index) => ({
              dayNumber: index + 1,
              title: String(day.title || `Dia ${index + 1}`),
              description: String(day.description || ''),
              attractions: {
                create: day.items.map(
                  (
                    item: {
                      title: string;
                      category: ItineraryCategory;
                      description?: string;
                      location?: string;
                      period?: string;
                      estimatedCost?: number;
                    },
                    order: number,
                  ) => ({
                    name: item.title,
                    category: Object.values(ItineraryCategory).includes(
                      item.category,
                    )
                      ? item.category
                      : ItineraryCategory.TOURIST_ATTRACTION,
                    fullDescription: String(item.description || ''),
                    address: String(item.location || ''),
                    period: String(item.period || ''),
                    duration: Number.isFinite(Number((item as any).duration))
                      ? Number((item as any).duration)
                      : null,
                    cost: Number.isFinite(Number((item as any).cost ?? item.estimatedCost))
                      ? Math.max(0, Number((item as any).cost ?? item.estimatedCost))
                      : 0,
                    currency: (item as any).currency || trip.currency || 'EUR',
                    notes: (item as any).notes ? String((item as any).notes) : null,
                    order: order + 1,
                  }),
                ),
              },
            })),
          },
        },
      });
      await tx.aIRequest.create({
        data: {
          baseTripId: id,
          provider: result.provider,
          model: result.model,
          prompt: 'Rascunho editorial com referências publicadas',
          response: result.parsedData,
          tokensUsed: result.tokensUsed,
          status: 'SUCCESS',
        },
      });
      return {
        id,
        message: 'Rascunho gerado. Revise os dias e locais antes de publicar.',
      };
    });
  }

  async copyTripToBase(id: string, adminId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { items: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!trip) throw new NotFoundException('Viagem não encontrada');
    if (!trip.days.length)
      throw new BadRequestException(
        'Adicione dias antes de copiar para a biblioteca.',
      );
    return this.prisma.baseTrip.create({
      data: {
        title: trip.title,
        destination: trip.destination,
        numberOfDays: trip.days.length,
        status: 'DRAFT',
        visibility: 'PRIVATE',
        tags: [],
        createdByAdminId: adminId,
        days: {
          create: trip.days.map((day, index) => ({
            dayNumber: index + 1,
            title: day.title,
            description: day.description,
            attractions: {
              create: day.items.map((item, order) => ({
                name: item.title,
                category: item.category,
                fullDescription: item.description,
                address: item.location,
                period: item.period,
                duration: item.duration,
                cost: item.cost,
                currency: item.currency,
                googleMapsLink: item.googleMapsLink,
                latitude: item.latitude,
                longitude: item.longitude,
                order: order + 1,
              })),
            },
          })),
        },
      },
    });
  }
}
