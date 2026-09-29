import { ItineraryEditorService } from './itinerary-editor.service';
import { BadRequestException } from '@nestjs/common';

describe('Editor de roteiros', () => {
  let prisma: any, provider: any, service: ItineraryEditorService;
  const draft = {
    id: 'base',
    status: 'DRAFT',
    days: [],
    numberOfDays: 1,
    destination: 'Roma',
    tags: [],
    updatedAt: new Date(),
  };
  beforeEach(() => {
    prisma = {
      baseTrip: {
        findUnique: jest.fn().mockResolvedValue(draft),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'copy' }),
      },
      trip: { findUnique: jest.fn() },
      aIRequest: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn((fn) => fn(prisma));
    provider = {
      generateItinerary: jest
        .fn()
        .mockResolvedValue({
          parsedData: {
            days: [
              {
                title: 'Roma',
                items: [{ title: 'Coliseu', category: 'MUSEUM' }],
              },
            ],
          },
          model: 'test',
          provider: 'OPENAI',
          tokensUsed: 10,
        }),
    };
    service = new ItineraryEditorService(prisma, {} as never, provider, {
      retrieveCuratedContext: jest.fn().mockResolvedValue({ destinations: [] }),
    } as never);
  });
  it('não sobrescreve conteúdo existente nem gera em publicado', async () => {
    for (const data of [
      { ...draft, days: [{ id: 'day' }] },
      { ...draft, status: 'PUBLISHED' },
    ]) {
      prisma.baseTrip.findUnique.mockResolvedValue(data);
      await expect(service.generateBaseTrip('base')).rejects.toThrow(
        BadRequestException,
      );
    }
    expect(provider.generateItinerary).not.toHaveBeenCalled();
  });
  it('salva geração completa em transação sem publicar automaticamente', async () => {
    await service.generateBaseTrip('base');
    expect(prisma.$transaction).toHaveBeenCalled();
    const update = prisma.baseTrip.update.mock.calls[0][0];
    expect(update.data.status).toBeUndefined();
    expect(update.data.days.create[0].attractions.create[0].name).toBe(
      'Coliseu',
    );
  });
  it('rejeita resposta incompleta sem persistência', async () => {
    provider.generateItinerary.mockResolvedValue({ parsedData: { days: [] } });
    await expect(service.generateBaseTrip('base')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('não substitui edição feita enquanto IA respondia', async () => {
    prisma.baseTrip.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, days: [{ id: 'manual' }] });
    await expect(service.generateBaseTrip('base')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.baseTrip.update).not.toHaveBeenCalled();
  });
  it('copia viagem para rascunho independente sem dados pessoais do viajante', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      title: 'Roma',
      destination: 'Roma',
      userId: 'private-user',
      days: [
        {
          title: 'Dia',
          items: [
            { title: 'Coliseu', category: 'MUSEUM', notes: 'private-note' },
          ],
        },
      ],
    });
    await service.copyTripToBase('trip', 'admin');
    const data = prisma.baseTrip.create.mock.calls[0][0].data;
    expect(data.status).toBe('DRAFT');
    expect(data.visibility).toBe('PRIVATE');
    expect(JSON.stringify(data)).not.toContain('private-user');
    expect(JSON.stringify(data)).not.toContain('private-note');
  });
});
