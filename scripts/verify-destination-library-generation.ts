import * as dotenv from 'dotenv';
dotenv.config();

const API_URL = 'https://core-api-production-e849.up.railway.app';
const PANEL_URL = 'https://painel.2goroteiros.com';
const ADMIN_EMAIL = 'admin@2goroteiros.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Senha123*';
const PARIS_BASE_TRIP_ID = 'af7cbc8c-fe18-436e-b2cb-9b9e86ec7584';

interface TestResult {
  step: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  detail?: string;
}

const results: TestResult[] = [];

function record(step: string, expected: string, actual: string, passed: boolean, detail?: string) {
  results.push({
    step,
    expected,
    actual,
    status: passed ? 'PASS' : 'FAIL',
    detail,
  });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${step} -> ${actual}${detail ? ` (${detail})` : ''}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('========================================================================');
  console.log('2GO — VALIDAÇÃO PRODUÇÃO: BIBLIOTECA DE DESTINOS + GERAÇÃO HORA A HORA');
  console.log(`API: ${API_URL}`);
  console.log(`Painel: ${PANEL_URL}`);
  console.log(`Destino Teste: Paris (${PARIS_BASE_TRIP_ID})`);
  console.log('========================================================================\n');

  // 1. Authenticate Admin
  console.log('--- ETAPA 1: AUTENTICAÇÃO ADMIN ---');
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const loginJson: any = await loginRes.json();
  const adminToken = loginJson.data?.accessToken;
  record(
    '1. Login Admin',
    'HTTP 200 com accessToken',
    `HTTP ${loginRes.status} (token presente: ${!!adminToken})`,
    loginRes.status === 200 && !!adminToken,
  );

  if (!adminToken) {
    console.error('Falha de login admin. Abortando.');
    process.exit(1);
  }

  // 2. Inspect and Update Paris BaseTrip (Destino & Sessão Escrita)
  console.log('\n--- ETAPA 2: INSPEÇÃO E ATUALIZAÇÃO DA BIBLIOTECA DE PARIS ---');
  const getParisRes = await fetch(`${API_URL}/admin/base-trips/${PARIS_BASE_TRIP_ID}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const getParisJson: any = await getParisRes.json();
  const parisData = getParisJson.data || getParisJson;
  record(
    '2.1 Leitura BaseTrip Paris',
    'HTTP 200 e dados do destino Paris',
    `HTTP ${getParisRes.status} (Destino: ${parisData?.destination}, Dias: ${parisData?.days?.length})`,
    getParisRes.status === 200 && parisData?.destination === 'Paris',
  );

  const parisShortDesc =
    parisData?.shortDescription ||
    'A Cidade Luz: capital mundial da arte, da arquitetura monumental e da gastronomia autêntica.';
  const parisFullDesc =
    parisData?.fullDescription ||
    `Curadoria Oficial 2GO Paris:
- Ritmo e Bairros: Paris se divide entre a solenidade clássica do 1er/7ème arrondissements e a boemia vibrante de Saint-Germain-des-Prés e Le Marais.
- Regra de Ouro da Manhã: Comece o dia cedo com um café e croissant parisiense tradicional antes de grandes museus.
- Museus e Arte: O Museu do Louvre requer entrada programada pela Pirâmide; reserve no mínimo 2 a 3 horas.
- Almoço e Pausa: Priorize bistrôs clássicos com comida de verdade, como o Bistrot Paul Bert no 11ème arrondissement.
- Tarde e Jardins: Caminhe pelas margens do Rio Sena e jardins das Tulherias, terminando próximo ao Campo de Marte e à majestosa Torre Eiffel.
- Noite e Jantar: O jantar é o ápice do dia parisiense e nunca deve ser omitido (20h às 22h). Restaurantes como o Café de Flore e bistrôs parisienses tradicionais oferecem a autêntica experiência noturna francesa.`;

  // Update Paris BaseTrip with rich written session and ensure status PUBLISHED
  const patchParisRes = await fetch(`${API_URL}/admin/base-trips/${PARIS_BASE_TRIP_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      title: 'Paris Clássica & Charmosa (Curadoria 2GO)',
      destination: 'Paris',
      country: 'França',
      city: 'Paris',
      region: 'Île-de-France',
      profile: 'Cultural & Gastronômico',
      shortDescription: parisShortDesc,
      fullDescription: parisFullDesc,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    }),
  });
  const patchParisJson: any = await patchParisRes.json();
  record(
    '2.2 Atualização da Sessão Escrita Paris (Status PUBLISHED)',
    'HTTP 200 com status PUBLISHED e sessão escrita preenchida',
    `HTTP ${patchParisRes.status} (Status: ${patchParisJson.data?.status || patchParisJson.status})`,
    patchParisRes.status === 200,
  );

  // Re-read Paris to check attractions and restaurants addresses
  const rereadParisRes = await fetch(`${API_URL}/admin/base-trips/${PARIS_BASE_TRIP_ID}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const rereadParisJson: any = await rereadParisRes.json();
  const refreshedParis = rereadParisJson.data || rereadParisJson;

  const attractions = refreshedParis.days?.flatMap((d: any) => d.attractions || []) || [];
  const restaurants = refreshedParis.days?.flatMap((d: any) => d.restaurants || []) || [];

  console.log(`\nAtrações cadastradas em Paris (${attractions.length}):`);
  for (const a of attractions) {
    console.log(` - [${a.id}] ${a.name} | Endereço: ${a.address || 'NÃO DEFINIDO'}`);
  }
  console.log(`Restaurantes cadastrados em Paris (${restaurants.length}):`);
  for (const r of restaurants) {
    console.log(` - [${r.id}] ${r.name} | Endereço: ${r.address || 'NÃO DEFINIDO'}`);
  }

  const allAttractionsHaveAddress =
    attractions.length >= 2 && attractions.every((a: any) => !!a.address && a.address.trim().length > 0);
  const allRestaurantsHaveAddress =
    restaurants.length >= 2 && restaurants.every((r: any) => !!r.address && r.address.trim().length > 0);

  record(
    '2.3 Validação de Endereço Obrigatório nas Atrações (≥2)',
    'Todas as atrações possuem endereço físico cadastrado',
    `${attractions.length} atrações, todas com endereço: ${allAttractionsHaveAddress}`,
    allAttractionsHaveAddress,
  );

  record(
    '2.4 Validação de Endereço Obrigatório nos Restaurantes (≥2)',
    'Todos os restaurantes possuem endereço físico cadastrado',
    `${restaurants.length} restaurantes, todos com endereço: ${allRestaurantsHaveAddress}`,
    allRestaurantsHaveAddress,
  );

  // 3. Test Full Wizard Ingestion via POST /planning-sessions
  console.log('\n--- ETAPA 3: INGESTÃO DO WIZARD COMPLETO DE UMA VEZ ---');
  const wizardPayload = {
    destinations: [
      {
        name: 'Paris',
        city: 'Paris',
        country: 'França',
        arrivalDate: '2026-11-10',
        arrivalTime: '08:30',
        departureDate: '2026-11-10',
        departureTime: '22:00',
        order: 1,
      },
    ],
    travelers: {
      adults: 2,
      children: 0,
      elders: 0,
    },
    interests: ['ART', 'GASTRONOMY', 'LOCAL_HISTORY'],
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
  if (createSessionRes.status !== 201) {
    console.error('Erro no POST /planning-sessions:', JSON.stringify(createSessionJson, null, 2));
  }
  const guestJourneyId =
    createSessionJson.data?.id ||
    createSessionJson.id ||
    createSessionJson.data?.guestJourneyId;
  const guestToken =
    createSessionJson.data?.guestToken || createSessionJson.guestToken;

  record(
    '3.1 Ingestão do Payload Completo (POST /planning-sessions)',
    'HTTP 201 com guestJourneyId e guestToken',
    `HTTP ${createSessionRes.status} (ID: ${guestJourneyId})`,
    createSessionRes.status === 201 && !!guestJourneyId && !!guestToken,
  );

  if (!guestJourneyId || !guestToken) {
    console.error('Falha ao criar sessão de planejamento. Abortando.');
    process.exit(1);
  }

  // Verify session state has all ingested questionnaire fields
  const getSessionRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}`, {
    headers: { 'X-Guest-Token': guestToken },
  });
  const getSessionJson: any = await getSessionRes.json();
  const sessionData = getSessionJson.data || getSessionJson;

  const questionnaireIngested =
    sessionData?.destinations?.length > 0 &&
    sessionData?.travelers?.adults === 2 &&
    sessionData?.interests?.length > 0 &&
    !!(sessionData?.activityHours || sessionData?.activityWindow) &&
    sessionData?.budgetLevel === 'MEDIUM';

  record(
    '3.2 Verificação dos Campos Ingeridos no Core',
    'Destinos, passageiros, interesses, horários e orçamento persistidos',
    `Destinos: ${sessionData?.destinations?.length}, Adultos: ${sessionData?.travelers?.adults}, Horário: ${JSON.stringify(sessionData?.activityHours || sessionData?.activityWindow)}`,
    questionnaireIngested,
  );

  // 4. Finalize Questionnaire & Trigger Generation
  console.log('\n--- ETAPA 4: FINALIZAÇÃO DO QUESTIONÁRIO E GERAÇÃO IA ---');
  const finalizeRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/finalize`, {
    method: 'POST',
    headers: { 'X-Guest-Token': guestToken },
  });
  const finalizeJson: any = await finalizeRes.json();
  record(
    '4.1 Finalização do Questionário',
    'HTTP 200 com status READY_TO_GENERATE',
    `HTTP ${finalizeRes.status} (Status: ${finalizeJson.data?.status || finalizeJson.status})`,
    finalizeRes.status === 200,
  );

  const generateRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/generate`, {
    method: 'POST',
    headers: { 'X-Guest-Token': guestToken },
  });
  const generateJson: any = await generateRes.json();
  record(
    '4.2 Disparo da Geração IA',
    'HTTP 202 com status GENERATING',
    `HTTP ${generateRes.status} (Status: ${generateJson.data?.status || generateJson.status})`,
    generateRes.status === 202,
  );

  // 5. Poll Generation Status until PREVIEW_READY
  console.log('\n--- ETAPA 5: ACOMPANHAMENTO DO STATUS DE GERAÇÃO ---');
  let currentStatus = 'GENERATING';
  let pollAttempts = 0;
  const maxAttempts = 30; // 30 * 3s = 90s max

  while (currentStatus === 'GENERATING' && pollAttempts < maxAttempts) {
    await sleep(3000);
    pollAttempts++;
    const statusRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/generation-status`, {
      headers: { 'X-Guest-Token': guestToken },
    });
    const statusJson: any = await statusRes.json();
    currentStatus = statusJson.data?.status || statusJson.status;
    console.log(`Tentativa ${pollAttempts}/${maxAttempts}: Status = ${currentStatus}`);
  }

  record(
    '5.1 Conclusão da Geração IA (Status PREVIEW_READY)',
    'Status PREVIEW_READY alcançado',
    `Status final: ${currentStatus} após ${pollAttempts * 3}s`,
    currentStatus === 'PREVIEW_READY',
  );

  if (currentStatus !== 'PREVIEW_READY') {
    console.error(`Geração falhou ou excedeu o tempo limite. Status: ${currentStatus}`);
    process.exit(1);
  }

  // 6. Fetch and Audit Generated Itinerary
  console.log('\n--- ETAPA 6: AUDITORIA DETALHADA DO ROTEIRO GERADO ---');
  const previewRes = await fetch(`${API_URL}/planning-sessions/${guestJourneyId}/preview`, {
    headers: { 'X-Guest-Token': guestToken },
  });
  const previewJson: any = await previewRes.json();
  const previewData = previewJson.data || previewJson;
  const visibleDays = previewData.visibleDays || [];

  record(
    '6.1 Retorno do Roteiro (GET /preview)',
    'HTTP 200 com dias visíveis gerados',
    `HTTP ${previewRes.status} (Dias visíveis: ${visibleDays.length})`,
    previewRes.status === 200 && visibleDays.length > 0,
  );

  const day1 = visibleDays[0];
  const items: any[] = day1?.activities || [];
  console.log(`\nItens do Dia 1 (${items.length} atividades):`);

  let breakfastCount = 0;
  let lunchCount = 0;
  let dinnerCount = 0;
  let baseTripCount = 0;
  let syntheticPlaceIdCount = 0;

  for (const item of items) {
    const title = item.title || '';
    const category = item.category || '';
    const timeLabel = item.timeLabel || '';
    const period = item.period || '';
    const sourceType = item.sourceType || '';
    const sourceId = item.sourceId || '';
    const providerPlaceId = item.providerPlaceId || '';

    const isBreakfast =
      category === 'CAFE' ||
      title.toLowerCase().includes('café da manhã') ||
      title.toLowerCase().includes('petit déjeuner') ||
      timeLabel.startsWith('08') ||
      timeLabel.startsWith('09:0');

    const isLunch =
      category === 'RESTAURANT' &&
      (timeLabel.startsWith('12') || timeLabel.startsWith('13') || period.toLowerCase().includes('almoço'));

    const isDinner =
      category === 'RESTAURANT' &&
      (timeLabel.startsWith('19') ||
        timeLabel.startsWith('20') ||
        timeLabel.startsWith('21') ||
        period.toLowerCase().includes('jantar') ||
        period.toLowerCase().includes('noite'));

    if (isBreakfast) breakfastCount++;
    if (isLunch) lunchCount++;
    if (isDinner) dinnerCount++;

    if (
      sourceType === 'BASE_TRIP' ||
      sourceType === 'BASE_ATTRACTION' ||
      sourceType === 'BASE_RESTAURANT' ||
      (sourceId && sourceId.length > 0)
    ) {
      baseTripCount++;
    }

    if (providerPlaceId && providerPlaceId.startsWith('ai_')) {
      syntheticPlaceIdCount++;
    }

    console.log(
      ` [${timeLabel || 'S/HORA'}] ${title} (${category}) | Período: ${period} | Proveniência: ${sourceType} (ID: ${sourceId || 'N/A'}) | PlaceID: ${providerPlaceId || 'Nenhum'}`,
    );
  }

  // 7. Verification Assertions
  const hasHourByHour = items.every((i) => !!i.timeLabel && i.timeLabel.includes(':'));
  record(
    '7.1 Grade Hora a Hora Contínua',
    'Todos os itens possuem timeLabel preenchido (HH:MM - HH:MM)',
    `Itens com horário: ${items.filter((i) => !!i.timeLabel).length}/${items.length}`,
    hasHourByHour,
  );

  const hasThreeMeals = breakfastCount >= 1 && lunchCount >= 1 && dinnerCount >= 1;
  record(
    '7.2 Três Refeições Presentes (Café, Almoço e Jantar)',
    'Pelo menos 1 café da manhã, 1 almoço e 1 jantar',
    `Café: ${breakfastCount}, Almoço: ${lunchCount}, Jantar: ${dinnerCount}`,
    hasThreeMeals,
  );

  const lastItem = items[items.length - 1];
  const lastTime = lastItem?.timeLabel || '';
  const dayReachesDinner =
    dinnerCount >= 1 ||
    lastTime.includes('20:') ||
    lastTime.includes('21:') ||
    lastTime.includes('22:') ||
    lastItem?.period === 'Noite';

  record(
    '7.3 O Dia Nunca Acaba na Tarde (Vai até o Jantar)',
    'Última atividade termina após as 20h ou é o jantar',
    `Último item: "${lastItem?.title}" às ${lastTime} (${lastItem?.period})`,
    dayReachesDinner,
  );

  record(
    '7.4 Prioridade e Presença da Biblioteca 2GO (BaseTrip)',
    'Pelo menos 1 item originário da curadoria 2GO (sourceType BASE_TRIP/BASE_ATTRACTION/BASE_RESTAURANT)',
    `${baseTripCount} itens com proveniência da biblioteca 2GO`,
    baseTripCount >= 1,
  );

  record(
    '7.5 Zero Alucinação de Place IDs',
    'Nenhum providerPlaceId sintético gerado por alucinação (ai_*)',
    `Place IDs sintéticos: ${syntheticPlaceIdCount}`,
    syntheticPlaceIdCount === 0,
  );

  // Summary
  console.log('\n========================================================================');
  console.log('RESUMO FINAL DA VALIDAÇÃO EM PRODUÇÃO:');
  console.log('========================================================================');
  const allPassed = results.every((r) => r.status === 'PASS');
  console.table(
    results.map((r) => ({
      Etapa: r.step,
      Status: r.status,
      Resultado: r.actual,
    })),
  );

  if (allPassed) {
    console.log('\n>>> TODOS OS TESTES PASSARAM COM SUCESSO EM PRODUÇÃO! <<<');
    process.exit(0);
  } else {
    console.error('\n>>> ALGUNS TESTES FALHARAM EM PRODUÇÃO. <<<');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Erro fatal na execução do script:', err);
  process.exit(1);
});
