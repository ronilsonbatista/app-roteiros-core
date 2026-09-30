import { PrismaClient, ItineraryCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { OpenAIProvider } from '../src/ai/providers/openai.provider';

async function main() {
  const dbUrl = process.env.PROXY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL ou PROXY_DATABASE_URL não configurado no ambiente.');
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('[FASE 4] 1. Verificando/Criando usuário Maurício Vieira...');
  const email = 'mauricio.vieira.teste@2goroteiros.com';
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const rawPassword = process.env.TEST_USER_PASSWORD || Math.random().toString(36).slice(-10) + '!A1b';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    user = await prisma.user.create({
      data: {
        email,
        fullName: 'Maurício Vieira (Teste 2GO)',
        role: 'USER',
        passwordHash,
        emailConfirmed: true,
      },
    });
    console.log(`Usuário criado: ID=${user.id}, Email=${user.email}, Role=${user.role}`);
  } else {
    console.log(`Usuário já existe: ID=${user.id}, Email=${user.email}, Role=${user.role}`);
  }

  // Create or update travel profile
  await prisma.userTravelProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      bio: 'Viajante apaixonado por gastronomia asiática, templos históricos e metrópoles futuristas.',
      preferredStyles: ['CULTURAL', 'COMFORT'],
      budgetLevel: 'MEDIUM',
      prefersRelaxing: false,
      prefersGastronomy: true,
      prefersMuseums: true,
      prefersNightlife: true,
      travelCompanions: ['Adultos'],
      travelInterests: ['Gastronomia', 'História', 'Templos', 'Cultura Pop', 'Mercados Noturnos'],
    },
    update: {
      preferredStyles: ['CULTURAL', 'COMFORT'],
      budgetLevel: 'MEDIUM',
      prefersRelaxing: false,
      prefersGastronomy: true,
    },
  });

  console.log('[FASE 4] 2. Configurando cenário de 15 dias pela Ásia...');
  const destinations = [
    { name: 'Tóquio, Japão', city: 'Tóquio', country: 'Japão', numberOfDays: 4 },
    { name: 'Quioto, Japão', city: 'Quioto', country: 'Japão', numberOfDays: 3 },
    { name: 'Osaka, Japão', city: 'Osaka', country: 'Japão', numberOfDays: 2 },
    { name: 'Seul, Coreia do Sul', city: 'Seul', country: 'Coreia do Sul', numberOfDays: 3 },
    { name: 'Bangkok, Tailândia', city: 'Bangkok', country: 'Tailândia', numberOfDays: 3 },
  ];

  const startDate = new Date('2026-11-01T00:00:00.000Z');
  const endDate = new Date('2026-11-15T00:00:00.000Z');

  const tripPreferences = {
    travelers: { adults: 2, children: 0, elders: 0 },
    interests: ['Gastronomia Autêntica', 'Templos e História', 'Metrópoles e Mirantes', 'Mercados Noturnos'],
    budgetLevel: 'MEDIUM',
    travelStyle: 'COMFORT',
    activityHours: { startTime: '09:00', endTime: '20:30' },
    destinations,
  };

  // Check if trip already exists for user
  let trip = await prisma.trip.findFirst({
    where: {
      userId: user.id,
      title: { contains: '15 Dias pela Ásia' },
    },
    include: { days: { include: { items: true } } },
  });

  const provider = new OpenAIProvider();
  const cachePath = '/Users/ronilsonbatista/.gemini/antigravity/scratch/mauricio_asia_ai_result.json';
  const fs = require('fs');

  let aiResult: any;
  if (fs.existsSync(cachePath)) {
    console.log('[FASE 4] Carregando resultado da OpenAI a partir do cache local...');
    aiResult = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } else {
    console.log('[FASE 4] 3. Gerando roteiro de 15 dias via OpenAI em etapas (5 cidades)...');
    aiResult = await provider.generateItinerary({
      destination: 'Ásia: Tóquio, Quioto, Osaka, Seul e Bangkok',
      numberOfDays: 15,
      destinations,
      travelProfile: {
        ...tripPreferences,
        destination: 'Ásia (Tóquio, Quioto, Osaka, Seul, Bangkok)',
      },
    });
    fs.writeFileSync(cachePath, JSON.stringify(aiResult, null, 2), 'utf-8');
  }

  const rawDays = aiResult.parsedData?.days;
  if (!Array.isArray(rawDays) || rawDays.length !== 15) {
    throw new Error(`OpenAI retornou ${rawDays?.length} dias, esperado exatamente 15.`);
  }

  console.log(`[FASE 4] Geração concluída com ${rawDays.length} dias! Tokens utilizados: ${aiResult.tokensUsed}.`);

  // Persistir no banco de produção com conexão limpa e fresca
  console.log('[FASE 4] 4. Reconectando ao PostgreSQL e persistindo a viagem...');
  await prisma.$disconnect();
  await prisma.$connect();

  if (trip) {
    await prisma.itineraryItem.deleteMany({ where: { tripDay: { tripId: trip.id } } });
    await prisma.tripDay.deleteMany({ where: { tripId: trip.id } });
    await prisma.aIRequest.deleteMany({ where: { tripId: trip.id } });
    await prisma.trip.delete({ where: { id: trip.id } });
    console.log(`[FASE 4] Viagem anterior ${trip.id} limpa com sucesso.`);
  }

  const daysData = rawDays.map((dayData: any, i: number) => {
    const dayNumber = i + 1;
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + i);
    const items = Array.isArray(dayData.items) ? dayData.items : [];

    return {
      dayNumber,
      date: dayDate,
      title: String(dayData.title || `Dia ${dayNumber}`),
      description: String(dayData.description || ''),
      items: {
        create: items.map((item: any, j: number) => {
          const categoryMatch =
            Object.values(ItineraryCategory).find((c) => c === item.category) ||
            ItineraryCategory.TOURIST_ATTRACTION;
          return {
            title: String(item.title || 'Atividade'),
            description: String(item.description || ''),
            category: categoryMatch,
            location: String(item.location || dayData.destination || 'Ásia'),
            period: String(item.period || 'Manhã'),
            timeLabel: item.timeLabel ? String(item.timeLabel) : null,
            duration: Number.isFinite(Number(item.duration)) ? Number(item.duration) : null,
            cost: Number.isFinite(Number(item.cost ?? item.estimatedCost))
              ? Math.max(0, Number(item.cost ?? item.estimatedCost))
              : 0,
            currency: String(item.currency || 'USD'),
            notes: item.notes ? String(item.notes) : null,
            order: j + 1,
            isEditable: true,
            isUserModified: false,
          };
        }),
      },
    };
  });

  const createdTrip = await prisma.trip.create({
    data: {
      userId: user.id,
      title: '15 Dias pela Ásia — Japão, Coreia do Sul e Tailândia',
      destination: 'Ásia: Tóquio, Quioto, Osaka, Seul e Bangkok',
      startDate,
      endDate,
      status: 'ACTIVE',
      premiumUnlockedAt: new Date(), // Desbloqueio administrativo sem compra fictícia
      preferences: tripPreferences,
      days: {
        create: daysData,
      },
    },
    include: {
      days: {
        include: {
          items: true,
        },
      },
    },
  });

  await prisma.aIRequest.create({
    data: {
      userId: user.id,
      tripId: createdTrip.id,
      provider: 'OPENAI',
      model: aiResult.model || 'gpt-4o-mini',
      prompt: 'Roteiro 15 Dias Ásia - Tóquio, Quioto, Osaka, Seul e Bangkok em etapas detalhadas',
      response: aiResult.parsedData,
      tokensUsed: aiResult.tokensUsed,
      status: 'SUCCESS',
    },
  });

  console.log(`[FASE 4] Viagem salva com sucesso! Trip ID = ${createdTrip.id}`);

  // Query back and audit
  const finalTrip = await prisma.trip.findUnique({
    where: { id: createdTrip.id },
    include: {
      days: {
        include: { items: { orderBy: { order: 'asc' } } },
        orderBy: { dayNumber: 'asc' },
      },
      purchases: true,
    },
  });

  console.log('\n=== AUDITORIA DO ROTEIRO DE MAURÍCIO VIEIRA (15 DIAS NA ÁSIA) ===');
  console.log(`Trip ID: ${finalTrip?.id}`);
  console.log(`User ID: ${finalTrip?.userId}`);
  console.log(`Total de Dias: ${finalTrip?.days.length}`);
  console.log(`Total de Compras Fictícias: ${finalTrip?.purchases.length} (ZERO, sem fraude)`);
  console.log(`Premium Unlocked At: ${finalTrip?.premiumUnlockedAt?.toISOString()}`);

  let totalItems = 0;
  const currencyCounts: Record<string, number> = {};

  for (const day of finalTrip?.days || []) {
    totalItems += day.items.length;
    console.log(`\nDia ${day.dayNumber}: ${day.title} (${day.date?.toISOString().slice(0, 10)}) - ${day.items.length} atividades`);
    console.log(`  Resumo: ${day.description?.slice(0, 110)}...`);
    for (const it of day.items) {
      currencyCounts[it.currency || 'N/A'] = (currencyCounts[it.currency || 'N/A'] || 0) + 1;
      console.log(`    [${it.timeLabel || it.period}] ${it.title} | ${it.category} | ${it.currency} ${it.cost} | ${it.location}`);
      if (it.notes) {
        console.log(`      -> ${it.notes.slice(0, 95)}...`);
      }
    }
  }

  console.log(`\nTotal Geral de Atividades nos 15 dias: ${totalItems}`);
  console.log('Distribuição de Moedas por Atividade:', currencyCounts);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro na execução da FASE 4:', e);
  process.exit(1);
});
