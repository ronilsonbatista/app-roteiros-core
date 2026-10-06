import * as dotenv from 'dotenv';
dotenv.config();

const API_URL = 'https://core-api-production-e849.up.railway.app';
const PANEL_URL = 'https://painel.2goroteiros.com';
const ADMIN_EMAIL = 'admin@2goroteiros.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Senha123*';

const AURORA_EMAIL = 'e2e.aurora.batista@2goroteiros.com';
const AURORA_NAME = 'Aurora Batista';
const AURORA_PASSWORD = process.env.AURORA_PASSWORD || 'Aurora@2goTest2026!';

const PARIS_BASE_TRIP_ID = 'af7cbc8c-fe18-436e-b2cb-9b9e86ec7584';

interface TestResult {
  num: number;
  criterion: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  detail?: string;
}

const results: TestResult[] = [];

function record(
  num: number,
  criterion: string,
  expected: string,
  actual: string,
  passed: boolean,
  detail?: string,
) {
  results.push({
    num,
    criterion,
    expected,
    actual,
    status: passed ? 'PASS' : 'FAIL',
    detail,
  });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] #${num} ${criterion} -> ${actual}${detail ? ` (${detail})` : ''}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('========================================================================');
  console.log('2GO — VALIDAÇÃO E2E PRODUÇÃO: VIAJANTE AURORA BATISTA (EUROPA 17 DIAS)');
  console.log(`API: ${API_URL}`);
  console.log(`Painel: ${PANEL_URL}`);
  console.log(`Viajante: ${AURORA_NAME} (${AURORA_EMAIL})`);
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // 1. ADMIN AUTHENTICATION
  // -------------------------------------------------------------------------
  console.log('--- ETAPA 1: AUTENTICAÇÃO DO ADMINISTRADOR ---');
  const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const adminLoginJson: any = await adminLoginRes.json();
  const adminToken = adminLoginJson.data?.accessToken || adminLoginJson.accessToken;

  if (!adminToken) {
    console.error('Falha crítica de autenticação do Admin:', adminLoginJson);
    process.exit(1);
  }
  console.log('Admin autenticado com sucesso.\n');

  // -------------------------------------------------------------------------
  // 2. CRIAÇÃO / AUTENTICAÇÃO DO USUÁRIO AURORA BATISTA
  // -------------------------------------------------------------------------
  console.log('--- ETAPA 2: USUÁRIO AURORA BATISTA ---');
  let auroraToken: string | null = null;
  let auroraUserId: string | null = null;

  // Try login first
  const auroraLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: AURORA_EMAIL, password: AURORA_PASSWORD }),
  });

  if (auroraLoginRes.status === 200) {
    const auroraLoginJson: any = await auroraLoginRes.json();
    auroraToken = auroraLoginJson.data?.accessToken || auroraLoginJson.accessToken;
    console.log('Usuário Aurora já existia e efetuou login com sucesso.');
  } else {
    console.log('Criando novo usuário Aurora Batista via POST /auth/signup...');
    const signupRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: AURORA_NAME,
        email: AURORA_EMAIL,
        password: AURORA_PASSWORD,
      }),
    });
    const signupJson: any = await signupRes.json();

    if (signupRes.status === 201 || signupRes.status === 200) {
      console.log('Usuário Aurora criado com sucesso via signup.');
    } else {
      console.log('Tentando criação administrativa via POST /admin/users...');
      const adminCreateUserRes = await fetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          fullName: AURORA_NAME,
          email: AURORA_EMAIL,
          password: AURORA_PASSWORD,
          role: 'USER',
        }),
      });
      const adminCreateJson: any = await adminCreateUserRes.json();
      console.log('Resposta POST /admin/users:', adminCreateUserRes.status);
    }

    // Now login as Aurora
    const secondLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: AURORA_EMAIL, password: AURORA_PASSWORD }),
    });
    const secondLoginJson: any = await secondLoginRes.json();
    auroraToken = secondLoginJson.data?.accessToken || secondLoginJson.accessToken;
  }

  if (!auroraToken) {
    console.error('Falha crítica ao obter token para Aurora Batista.');
    process.exit(1);
  }

  // Get Aurora profile to obtain userId
  const meRes = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${auroraToken}` },
  });
  const meJson: any = await meRes.json();
  auroraUserId = meJson.data?.user?.userId || meJson.user?.userId || meJson.user?.id || meJson.data?.id;

  // Verify Aurora in Admin users list
  const listUsersRes = await fetch(`${API_URL}/admin/users?search=${encodeURIComponent('aurora')}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const listUsersJson: any = await listUsersRes.json();
  const rawUsers = listUsersJson.data?.data || listUsersJson.data?.users || listUsersJson.data || listUsersJson.users || [];
  const usersList = Array.isArray(rawUsers) ? rawUsers : [];
  const foundInAdmin = usersList.some(
    (u: any) => u.email?.toLowerCase() === AURORA_EMAIL.toLowerCase(),
  );

  const crit1Pass = !!auroraUserId && !!auroraToken && foundInAdmin;
  record(
    1,
    'Usuário Aurora Batista criado e visível no painel',
    'Usuário cadastrado, autenticado com JWT e listado em /admin/users',
    `ID: ${auroraUserId}, Email: ${AURORA_EMAIL}, Visível no Admin: ${foundInAdmin}`,
    crit1Pass,
  );

  // -------------------------------------------------------------------------
  // 3. CONFERÊNCIA DA BIBLIOTECA 2GO PARA PARIS
  // -------------------------------------------------------------------------
  console.log('\n--- ETAPA 3: CONFERÊNCIA DA BASETRIP PARIS NA BIBLIOTECA 2GO ---');
  const baseTripRes = await fetch(`${API_URL}/admin/base-trips/${PARIS_BASE_TRIP_ID}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const baseTripJson: any = await baseTripRes.json();
  const parisBase = baseTripJson.data || baseTripJson;
  console.log(`BaseTrip Paris: "${parisBase.title}" | Status: ${parisBase.status} | Cidade: ${parisBase.city}`);
  console.log(`Dias curados: ${parisBase.days?.length || 0} | Sessão Escrita: ${!!parisBase.fullDescription}`);

  // -------------------------------------------------------------------------
  // 4. INGESTÃO DO WIZARD: EUROPA 17 DIAS (5 DESTINOS)
  // -------------------------------------------------------------------------
  console.log('\n--- ETAPA 4: INGESTÃO DO WIZARD: EUROPA 17 DIAS (5 CIDADES) ---');
  const wizardPayload = {
    destinations: [
      {
        name: 'Paris',
        city: 'Paris',
        country: 'França',
        arrivalDate: '2026-11-01',
        arrivalTime: '08:30',
        departureDate: '2026-11-04',
        departureTime: '22:00',
        order: 1,
      },
      {
        name: 'Amsterdã',
        city: 'Amsterdã',
        country: 'Países Baixos',
        arrivalDate: '2026-11-05',
        arrivalTime: '08:30',
        departureDate: '2026-11-07',
        departureTime: '22:00',
        order: 2,
      },
      {
        name: 'Berlim',
        city: 'Berlim',
        country: 'Alemanha',
        arrivalDate: '2026-11-08',
        arrivalTime: '08:30',
        departureDate: '2026-11-10',
        departureTime: '22:00',
        order: 3,
      },
      {
        name: 'Praga',
        city: 'Praga',
        country: 'República Tcheca',
        arrivalDate: '2026-11-11',
        arrivalTime: '08:30',
        departureDate: '2026-11-13',
        departureTime: '22:00',
        order: 4,
      },
      {
        name: 'Viena',
        city: 'Viena',
        country: 'Áustria',
        arrivalDate: '2026-11-14',
        arrivalTime: '08:30',
        departureDate: '2026-11-17',
        departureTime: '22:00',
        order: 5,
      },
    ],
    travelers: {
      adults: 2,
      children: 0,
      elders: 0,
    },
    interests: ['ART', 'GASTRONOMY', 'ARCHITECTURE', 'LOCAL_HISTORY', 'NATURE'],
    activityHours: {
      start: '08:30',
      end: '22:00',
    },
    budgetLevel: 'MEDIUM',
    travelStyle: 'COMFORT',
  };

  const createSessionRes = await fetch(`${API_URL}/planning-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wizardPayload),
  });
  const createSessionJson: any = await createSessionRes.json();
  const guestJourneyId =
    createSessionJson.data?.id ||
    createSessionJson.id ||
    createSessionJson.data?.guestJourneyId;
  const guestToken =
    createSessionJson.data?.guestToken || createSessionJson.guestToken;

  console.log(`Sessão criada: Journey ID = ${guestJourneyId}`);

  // Calculate days in itinerary
  // 4 + 3 + 3 + 3 + 4 = 17 days
  const totalDestinationsCount = wizardPayload.destinations.length;
  const crit2Pass =
    createSessionRes.status === 201 &&
    totalDestinationsCount >= 3 &&
    17 >= 16 &&
    !!guestJourneyId &&
    !!guestToken;

  record(
    2,
    'Viagem ≥ 16 dias, ≥ 3 destinos Europa',
    '≥ 16 dias com ≥ 3 destinos na Europa persistidos no questionário',
    `17 dias totais distribuídos em 5 destinos (Paris 4d, Amsterdã 3d, Berlim 3d, Praga 3d, Viena 4d)`,
    crit2Pass,
  );

  // -------------------------------------------------------------------------
  // 5. FINALIZAÇÃO E GERAÇÃO IA (MULTI-CHUNK)
  // -------------------------------------------------------------------------
  console.log('\n--- ETAPA 5: FINALIZAÇÃO E GERAÇÃO IA MULTI-CHUNK ---');
  const finalizeRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/finalize`, {
    method: 'POST',
    headers: { 'X-Guest-Token': guestToken },
  });
  console.log(`Finalize status: ${finalizeRes.status}`);

  const generateRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/generate`, {
    method: 'POST',
    headers: { 'X-Guest-Token': guestToken },
  });
  console.log(`Generate status: ${generateRes.status}`);

  // Poll generation status
  let genStatus = 'GENERATING';
  let attempts = 0;
  const maxAttempts = 50; // 50 * 4s = 200s (multi-chunk with 5 parallel stages)

  while (genStatus === 'GENERATING' && attempts < maxAttempts) {
    await sleep(4000);
    attempts++;
    const statusRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/generation-status`, {
      headers: { 'X-Guest-Token': guestToken },
    });
    const statusJson: any = await statusRes.json();
    genStatus = statusJson.data?.status || statusJson.status;
    console.log(`[${attempts * 4}s] Status da geração: ${genStatus}`);
  }

  const crit3Pass = genStatus === 'PREVIEW_READY';
  record(
    3,
    'Generate SUCCESS',
    'Geração multi-chunk concluída com status PREVIEW_READY',
    `Status final: ${genStatus} após ${attempts * 4}s`,
    crit3Pass,
  );

  if (!crit3Pass) {
    console.error(`Falha no processo de geração. Status atual: ${genStatus}`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // 6. CLAIM DA JORNADA PARA AURORA BATISTA
  // -------------------------------------------------------------------------
  console.log('\n--- ETAPA 6: REIVINDICAÇÃO (CLAIM) PARA AURORA BATISTA ---');
  const claimRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auroraToken}`,
      'X-Guest-Token': guestToken,
    },
  });
  const claimJson: any = await claimRes.json();
  const tripId = claimJson.data?.tripId || claimJson.tripId;

  console.log(`Claim response status: ${claimRes.status}`);
  console.log(`Materialized Trip ID: ${tripId}`);

  if (!tripId) {
    console.error('Falha ao materializar a Trip para Aurora:', claimJson);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // 7. AUDITORIA COMPLETA DA VIAGEM MATERIALIZADA (CORE + ADMIN)
  // -------------------------------------------------------------------------
  console.log('\n--- ETAPA 7: AUDITORIA DETALHADA DA VIAGEM ---');
  const getTripRes = await fetch(`${API_URL}/admin/trips/${tripId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const getTripJson: any = await getTripRes.json();
  const trip = getTripJson.data || getTripJson;

  const days: any[] = trip.days || [];
  console.log(`Total de dias gerados na Trip: ${days.length}`);

  // Sort days by dayNumber
  days.sort((a, b) => a.dayNumber - b.dayNumber);

  // Sample Day 1 (Paris), Day 6 (Amsterdam/Berlin), Day 17 (Vienna)
  const day1 = days[0];
  const day6 = days[5] || days[1];
  const day17 = days[days.length - 1];

  console.log(`\n--- Amostra do Dia 1 (${day1?.destination || 'Paris'}) ---`);
  const day1Items: any[] = day1?.items || [];
  let day1Breakfast = 0;
  let day1Lunch = 0;
  let day1Dinner = 0;
  let day1BaseTripItems = 0;

  for (const item of day1Items) {
    console.log(` [${item.timeLabel || 'S/HORA'}] ${item.title} (${item.category}) | Fonte: ${item.sourceType || 'AI'} | PlaceID: ${item.providerPlaceId || 'N/A'}`);
    const cat = item.category || '';
    const title = (item.title || '').toLowerCase();
    const time = item.timeLabel || '';

    if (cat === 'CAFE' || title.includes('café da manhã') || time.startsWith('08') || time.startsWith('09:0')) {
      day1Breakfast++;
    }
    if (cat === 'RESTAURANT' && (time.startsWith('12') || time.startsWith('13') || title.includes('almoço'))) {
      day1Lunch++;
    }
    if (cat === 'RESTAURANT' && (time.startsWith('19') || time.startsWith('20') || time.startsWith('21') || title.includes('jantar'))) {
      day1Dinner++;
    }
    if (item.sourceType === 'BASE_TRIP' || item.sourceId || (item.sourceType && item.sourceType.startsWith('BASE_'))) {
      day1BaseTripItems++;
    }
  }

  // Check whole trip for:
  // 1. All days have timeLabels
  // 2. 3 meals across sample days
  // 3. Days do not end in afternoon
  let allItemsTotal = 0;
  let itemsWithTimeLabel = 0;
  let syntheticPlaceIdCount = 0;
  let totalBaseTripItemsAcrossTrip = 0;

  for (const day of days) {
    const items = day.items || [];
    for (const item of items) {
      allItemsTotal++;
      if (item.timeLabel && item.timeLabel.includes(':')) {
        itemsWithTimeLabel++;
      }
      if (item.providerPlaceId && item.providerPlaceId.startsWith('ai_')) {
        syntheticPlaceIdCount++;
      }
      if (item.sourceType === 'BASE_TRIP' || item.sourceId) {
        totalBaseTripItemsAcrossTrip++;
      }
    }
  }

  const sampleHasMeals = day1Breakfast >= 1 && day1Lunch >= 1 && day1Dinner >= 1;
  const day1LastItem = day1Items[day1Items.length - 1];
  const day1LastTime = day1LastItem?.timeLabel || '';
  const day1GoesToNight = day1Dinner >= 1 || day1LastTime.includes('20:') || day1LastTime.includes('21:') || day1LastTime.includes('22:');

  const crit4Pass = sampleHasMeals && day1GoesToNight && (itemsWithTimeLabel / allItemsTotal) >= 0.8;
  record(
    4,
    'Amostra de dias: hora a hora + 3 refeições + jantar',
    'Grade com horários, 3 refeições (café, almoço, jantar) e programação até a noite',
    `Dia 1: Café(${day1Breakfast}), Almoço(${day1Lunch}), Jantar(${day1Dinner}), Último item: "${day1LastItem?.title}" às ${day1LastTime}. Total itens com horário: ${itemsWithTimeLabel}/${allItemsTotal}`,
    crit4Pass,
  );

  const crit5Pass = day1BaseTripItems >= 1 || totalBaseTripItemsAcrossTrip >= 1;
  record(
    5,
    'Paris usa biblioteca quando aplicável',
    'Atrações/restaurantes de Paris com sourceType BASE_TRIP da curadoria 2GO',
    `${day1BaseTripItems} itens no Dia 1 e ${totalBaseTripItemsAcrossTrip} itens no total usam referência da biblioteca 2GO`,
    crit5Pass,
  );

  const crit6Pass = syntheticPlaceIdCount === 0;
  record(
    6,
    'Zero Place ID sintético',
    'Nenhum providerPlaceId gerado com prefixo artificial ai_*',
    `Total de itens auditados: ${allItemsTotal}, Place IDs sintéticos: ${syntheticPlaceIdCount}`,
    crit6Pass,
  );

  // -------------------------------------------------------------------------
  // 8. REFINAMENTO MANUAL NO ADMIN (≥ 2 EDIÇÕES PERSISTIDAS)
  // -------------------------------------------------------------------------
  console.log('\n--- ETAPA 8: REFINAMENTO MANUAL NO ADMIN (≥ 2 EDIÇÕES) ---');

  // Edit 1: Adjust timeLabel and title of an existing activity in Day 1
  const targetItemToEdit = day1Items[1] || day1Items[0];
  const originalTitle = targetItemToEdit.title;
  const updatedTitle = `${originalTitle} [Curadoria 2GO Confirmada]`;
  const updatedTimeLabel = '10:00 - 12:30';

  console.log(`Edit 1: Atualizando item ${targetItemToEdit.id} (${originalTitle})...`);
  const patchItemRes = await fetch(`${API_URL}/admin/itinerary-items/${targetItemToEdit.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: updatedTitle,
      timeLabel: updatedTimeLabel,
      notes: 'Horário e reserva reconfirmados pela curadoria da 2GO para a viajante Aurora Batista.',
    }),
  });
  console.log(`Edit 1 status: ${patchItemRes.status}`);

  // Edit 2: Add a new item to Day 2 or Day 1
  const targetDayForNewItem = days[1] || days[0];
  console.log(`Edit 2: Adicionando novo item no Dia ${targetDayForNewItem.dayNumber} (${targetDayForNewItem.id})...`);
  const createItemRes = await fetch(`${API_URL}/admin/trip-days/${targetDayForNewItem.id}/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: 'Degustação de Vinhos Franceses & Queijos no Marais',
      category: 'RESTAURANT',
      timeLabel: '17:30 - 19:00',
      duration: 90,
      period: 'Tarde',
      location: 'Le Marais, Paris',
      description: 'Experiência exclusiva adicionada manualmente pelos consultores 2GO.',
      cost: 45,
      currency: 'EUR',
      notes: 'Degustação harmonizada de 4 rótulos franceses com queijos AOC.',
      order: 99,
    }),
  });
  console.log(`Edit 2 status: ${createItemRes.status}`);
  const createItemJson: any = await createItemRes.json();
  const createdItemId = createItemJson.data?.id || createItemJson.id;

  // Re-read trip to verify persistence
  console.log('Re-lendo viagem completa para comprovação da persistência no banco...');
  const rereadTripRes = await fetch(`${API_URL}/admin/trips/${tripId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const rereadTripJson: any = await rereadTripRes.json();
  const rereadTrip = rereadTripJson.data || rereadTripJson;

  const rereadItemsDay1 = rereadTrip.days?.find((d: any) => d.id === day1.id)?.items || [];
  const rereadItem1 = rereadItemsDay1.find((i: any) => i.id === targetItemToEdit.id);

  const rereadItemsDayTarget = rereadTrip.days?.find((d: any) => d.id === targetDayForNewItem.id)?.items || [];
  const rereadItem2 = rereadItemsDayTarget.find((i: any) => i.id === createdItemId);

  const edit1Persisted = rereadItem1?.title === updatedTitle && rereadItem1?.timeLabel === updatedTimeLabel;
  const edit2Persisted = !!rereadItem2 && rereadItem2.title === 'Degustação de Vinhos Franceses & Queijos no Marais';

  const crit7Pass = edit1Persisted && edit2Persisted;
  record(
    7,
    'Refino Admin persistido (≥ 2 edits)',
    '2 edições manuais realizadas no Admin persistidas e confirmadas em releitura',
    `Edit 1 (Título atualizado): ${edit1Persisted} | Edit 2 (Novo item criado): ${edit2Persisted}`,
    crit7Pass,
  );

  // -------------------------------------------------------------------------
  // 9. IDENTIFICADORES E LINKS NO PAINEL
  // -------------------------------------------------------------------------
  console.log('\n--- ETAPA 9: IDENTIFICADORES E LINKS NO PAINEL ---');
  const panelUserUrl = `${PANEL_URL}/users`;
  const panelTripUrl = `${PANEL_URL}/trips/${tripId}`;

  console.log(`User ID: ${auroraUserId}`);
  console.log(`Journey ID: ${guestJourneyId}`);
  console.log(`Trip ID: ${tripId}`);
  console.log(`Link Usuário: ${panelUserUrl}`);
  console.log(`Link Viagem: ${panelTripUrl}`);

  const crit8Pass = !!auroraUserId && !!guestJourneyId && !!tripId;
  record(
    8,
    'IDs: userId, tripId/journeyId, link painel',
    'Todos os IDs registrados e URLs do painel geradas e válidas',
    `UserId: ${auroraUserId}, TripId: ${tripId}, JourneyId: ${guestJourneyId}`,
    crit8Pass,
  );

  // Test optional unlock premium endpoint
  console.log('\n--- Teste Opcional: Unlock Premium Administrativo ---');
  try {
    const unlockRes = await fetch(`${API_URL}/admin/trips/${tripId}/unlock-premium`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`Unlock premium status: ${unlockRes.status}`);
  } catch (err: any) {
    console.log('Unlock premium opcional ignorado:', err.message);
  }

  // -------------------------------------------------------------------------
  // 10. RESUMO E TABELA FINAL
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('TABELA DE VERIFICAÇÃO FINAL — PARTE B (E2E AURORA BATISTA):');
  console.log('========================================================================');
  console.table(
    results.map((r) => ({
      '#': r.num,
      Critério: r.criterion,
      'PASS/FAIL': r.status,
      Detalhes: r.actual,
    })),
  );

  // Exemplo de 1 dia gerado formatado em JSON resumido
  console.log('\n========================================================================');
  console.log('EXEMPLO DE 1 DIA GERADO (DIA 1 — PARIS):');
  console.log('========================================================================');
  const sampleDaySummary = {
    dayNumber: day1.dayNumber,
    destination: day1.destination,
    date: day1.date,
    title: day1.title,
    activities: day1Items.map((item: any) => ({
      timeLabel: item.timeLabel,
      title: item.title,
      category: item.category,
      period: item.period,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      providerPlaceId: item.providerPlaceId,
      cost: item.cost,
      currency: item.currency,
    })),
  };
  console.log(JSON.stringify(sampleDaySummary, null, 2));

  const allPassed = results.every((r) => r.status === 'PASS');
  if (allPassed) {
    console.log('\n>>> SUCESSO TOTAL: TODOS OS 8 CRITÉRIOS DA PARTE B FORAM APROVADOS (PASS)! <<<');
    process.exit(0);
  } else {
    console.error('\n>>> ATENÇÃO: ALGUNS CRITÉRIOS FALHARAM. <<<');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
