import { PrismaClient, ItineraryCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { OpenAIProvider } from '../src/ai/providers/openai.provider';

async function main() {
  const dbUrl =
    process.env.PROXY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:ggAcspmVPUtCQCCUzUxQCJPeaTHqvdDY@sakura.proxy.rlwy.net:33701/railway?sslmode=require';

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const tripId = '20665188-c958-4961-ae33-ba24a7d89168';
  const expectedUserId = 'b0bfdd48-57f2-48f3-935f-e840de72db2c';

  console.log(`[FASE 3] Buscando viagem existente ${tripId}...`);
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { dayNumber: 'asc' },
      },
    },
  });

  if (!trip) {
    throw new Error(`Viagem ${tripId} não encontrada no banco.`);
  }

  if (trip.userId !== expectedUserId) {
    throw new Error(`Trip userId mismatch: esperado ${expectedUserId}, encontrado ${trip.userId}`);
  }

  console.log(`Viagem confirmada: "${trip.title}" (${trip.destination}).`);
  console.log(`Dias anteriores: ${trip.days.length} dias, total de itens: ${trip.days.reduce((acc, d) => acc + d.items.length, 0)} itens.`);
  console.log(`Status de desbloqueio: ${trip.premiumUnlockedAt ? 'PREMIUM ATIVO' : 'BLOQUEADO'}.`);

  // Instanciar OpenAIProvider
  const provider = new OpenAIProvider();

  console.log('[FASE 3] Chamando OpenAI para nova geração hiperdetalhada com café, refeições, durações e moeda EUR...');
  const result = await provider.generateItinerary({
    destination: trip.destination,
    numberOfDays: 3,
    travelProfile: {
      ...((trip.preferences as any) || {}),
      destination: 'Roma',
      preferredStyles: ['Histórico', 'Gastronômico', 'Arquitetura'],
      budgetLevel: 'MEDIUM',
      travelStyle: 'COMFORT',
      tripPreferences: trip.preferences,
    },
  });

  const rawDays = result.parsedData?.days;
  if (!Array.isArray(rawDays) || rawDays.length !== 3) {
    throw new Error(`OpenAI retornou formato inválido de dias: ${rawDays?.length}`);
  }

  console.log(`[FASE 3] IA gerou ${rawDays.length} dias com sucesso. Consumo de tokens: ${result.tokensUsed}.`);

  // Substituição atômica no banco de produção
  console.log('[FASE 3] Executando substituição atômica no banco de dados...');
  await prisma.$transaction(async (tx) => {
    // 1. Deletar itens anteriores desta viagem
    await tx.itineraryItem.deleteMany({
      where: { tripDay: { tripId } },
    });

    // 2. Deletar dias anteriores desta viagem
    await tx.tripDay.deleteMany({
      where: { tripId },
    });

    // 3. Criar novos dias e itens
    const startDate = new Date('2026-11-10T00:00:00.000Z');

    for (let i = 0; i < rawDays.length; i++) {
      const dayData = rawDays[i];
      const dayNumber = i + 1;
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);

      const createdDay = await tx.tripDay.create({
        data: {
          tripId,
          dayNumber,
          date: dayDate,
          title: String(dayData.title || `Dia ${dayNumber}`),
          description: String(dayData.description || ''),
        },
      });

      const items = Array.isArray(dayData.items) ? dayData.items : [];
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        const categoryMatch =
          Object.values(ItineraryCategory).find((c) => c === item.category) ||
          ItineraryCategory.TOURIST_ATTRACTION;

        await tx.itineraryItem.create({
          data: {
            tripDayId: createdDay.id,
            title: String(item.title || 'Atividade'),
            description: String(item.description || ''),
            category: categoryMatch,
            location: String(item.location || 'Roma'),
            period: String(item.period || 'Manhã'),
            timeLabel: item.timeLabel ? String(item.timeLabel) : null,
            duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : null,
            cost: Number.isFinite(Number(item.cost ?? item.estimatedCost))
              ? Math.max(0, Number(item.cost ?? item.estimatedCost))
              : 0,
            currency: 'EUR',
            notes: item.notes ? String(item.notes) : null,
            order: j + 1,
            isEditable: true,
            isUserModified: false,
          },
        });
      }
    }

    // 4. Registrar AIRequest
    await tx.aIRequest.create({
      data: {
        userId: trip.userId,
        tripId,
        provider: 'OPENAI',
        model: result.model || 'gpt-4o-mini',
        prompt: 'Refatoração Roteiro Roma - 3 dias detalhados com refeições e horários',
        response: result.parsedData,
        tokensUsed: result.tokensUsed,
        status: 'SUCCESS',
      },
    });
  }, { timeout: 30000, maxWait: 15000 });

  console.log('[FASE 3] Substituição atômica concluída com sucesso!');

  // Recarregar dados gravados
  const updatedTrip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      days: {
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { dayNumber: 'asc' },
      },
    },
  });

  console.log('\n=== ROTEIRO ATUALIZADO DE ROMA ===');
  console.log(`Viagem: ${updatedTrip?.title}`);
  console.log(`Dias totais: ${updatedTrip?.days.length}`);
  let totalNewItems = 0;
  for (const day of updatedTrip?.days || []) {
    console.log(`\n--- DIA ${day.dayNumber}: ${day.title} (${day.date?.toISOString().slice(0, 10)}) ---`);
    console.log(`Resumo: ${day.description}`);
    for (const it of day.items) {
      totalNewItems++;
      console.log(`  [${it.timeLabel || it.period}] ${it.title} (${it.category})`);
      console.log(`    Local: ${it.location} | Duração: ${it.duration}m | Custo: ${it.currency} ${it.cost}`);
      console.log(`    Descrição: ${it.description?.slice(0, 100)}...`);
      if (it.notes) {
        console.log(`    Notas/Deslocamento/Reserva: ${it.notes}`);
      }
    }
  }
  console.log(`\nTotal novo de atividades: ${totalNewItems} (Anterior: 8).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro na execução:', e);
  process.exit(1);
});
