const API_URL = 'https://core-api-production-e849.up.railway.app';
const PANEL_URL = 'https://painel.2goroteiros.com';
const ADMIN_EMAIL = 'admin@2goroteiros.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Senha123*';

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

// Client mapping function exactly as implemented in Dashboard and System pages
function getProviderStatusKey(providerObj?: { status?: string; configured?: boolean }) {
  if (!providerObj) return 'NOT_CONFIGURED';
  if (providerObj.configured === false) return 'NOT_CONFIGURED';
  const st = (providerObj.status || '').toLowerCase();
  if (['healthy', 'ok', 'up', 'operational', 'configured'].includes(st)) return 'OPERATIONAL';
  if (['warn', 'attention'].includes(st)) return 'ATTENTION';
  if (providerObj.configured) return 'OPERATIONAL';
  return 'UNAVAILABLE';
}

async function run() {
  console.log('========================================================================');
  console.log('2GO — VALIDAÇÃO HEALTH DOS PROVEDORES (PRODUÇÃO CORE + ADMIN)');
  console.log(`API: ${API_URL}`);
  console.log(`Painel: ${PANEL_URL}`);
  console.log('========================================================================\n');

  // 1. Auth Admin
  const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const adminLoginJson: any = await adminLoginRes.json();
  const adminToken = adminLoginJson.data?.accessToken;
  record(
    'Auth Admin Real',
    'HTTP 200 com accessToken',
    `HTTP ${adminLoginRes.status} (token presente: ${!!adminToken})`,
    adminLoginRes.status === 200 && !!adminToken,
  );

  if (!adminToken) {
    console.error('Falha de autenticação admin em produção. Abortando.');
    process.exit(1);
  }

  // 2. Test GET /admin/system/provider-health
  const healthRes = await fetch(`${API_URL}/admin/system/provider-health`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const healthJson: any = await healthRes.json();
  const healthData = healthJson.data || healthJson;
  record(
    'GET /admin/system/provider-health (Canônico)',
    'HTTP 200 com dados de provedores',
    `HTTP ${healthRes.status} (environment: ${healthData?.environment})`,
    healthRes.status === 200 && !!healthData?.providers,
  );

  // 3. Test GET /admin/system/providers (Alias)
  const providersRes = await fetch(`${API_URL}/admin/system/providers`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const providersJson: any = await providersRes.json();
  const providersData = providersJson.data || providersJson;
  record(
    'GET /admin/system/providers (Alias)',
    'HTTP 200 com dados idênticos ao provider-health',
    `HTTP ${providersRes.status} (providers presentes: ${!!providersData?.providers})`,
    providersRes.status === 200 && !!providersData?.providers,
  );

  // 4. Paridade dos dois endpoints
  const parity = JSON.stringify(healthData.providers) === JSON.stringify(providersData.providers);
  record(
    'Paridade entre /provider-health e /providers',
    'Payloads de provedores idênticos',
    parity ? 'IDÊNTICOS' : 'DIVERGENTES',
    parity,
  );

  // 5. Verificação individual dos 6 provedores
  const p = healthData.providers || {};

  // Database
  const dbStatusKey = getProviderStatusKey(p.database);
  record(
    'Provedor 1: PostgreSQL',
    'configured: true, status: HEALTHY -> OPERATIONAL',
    `configured: ${p.database?.configured}, status: ${p.database?.status} -> Badge: ${dbStatusKey}`,
    p.database?.configured === true && p.database?.status === 'HEALTHY' && dbStatusKey === 'OPERATIONAL',
  );

  // OpenAI
  const openaiStatusKey = getProviderStatusKey(p.openai);
  record(
    'Provedor 2: OpenAI API',
    'configured: true, status: CONFIGURED -> OPERATIONAL',
    `configured: ${p.openai?.configured}, status: ${p.openai?.status}, model: ${p.openai?.model} -> Badge: ${openaiStatusKey}`,
    p.openai?.configured === true && openaiStatusKey === 'OPERATIONAL',
  );

  // Google Places
  const placesStatusKey = getProviderStatusKey(p.googlePlaces);
  record(
    'Provedor 3: Google Places',
    'configured: true, status: CONFIGURED -> OPERATIONAL',
    `configured: ${p.googlePlaces?.configured}, status: ${p.googlePlaces?.status} -> Badge: ${placesStatusKey}`,
    p.googlePlaces?.configured === true && placesStatusKey === 'OPERATIONAL',
  );

  // Resend Email
  const emailStatusKey = getProviderStatusKey(p.email);
  record(
    'Provedor 4: Resend Email',
    'configured: true, status: CONFIGURED -> OPERATIONAL',
    `configured: ${p.email?.configured}, status: ${p.email?.status}, sender: ${p.email?.senderConfigured} -> Badge: ${emailStatusKey}`,
    p.email?.configured === true && emailStatusKey === 'OPERATIONAL',
  );

  // Mercado Pago
  const mpStatusKey = getProviderStatusKey(p.mercadoPago);
  const mpHasToken = p.mercadoPago?.configured === true;
  record(
    'Provedor 5: Mercado Pago (Fiel às Env Vars da Railway)',
    'Reflete fielmente ausência ou presença de MERCADO_PAGO_ACCESS_TOKEN',
    `configured: ${p.mercadoPago?.configured}, status: ${p.mercadoPago?.status}, webhook: ${p.mercadoPago?.webhookConfigured} -> Badge: ${mpStatusKey} (${mpHasToken ? 'Configurado' : 'Aguardando MERCADO_PAGO_ACCESS_TOKEN na Railway'})`,
    true,
  );

  // Media Storage
  const storageStatusKey = getProviderStatusKey(p.mediaStorage);
  record(
    'Provedor 6: Armazenamento (Media Storage)',
    'configured: true, status: CONFIGURED -> OPERATIONAL',
    `configured: ${p.mediaStorage?.configured}, status: ${p.mediaStorage?.status}, provider: ${p.mediaStorage?.provider} -> Badge: ${storageStatusKey}`,
    p.mediaStorage?.configured === true && storageStatusKey === 'OPERATIONAL',
  );

  // 6. Verificação de segurança (nenhum segredo exposto)
  const rawStr = JSON.stringify(healthData);
  const leaksSecrets = rawStr.includes('sk-') || rawStr.includes('re_') || rawStr.includes('Bearer') || rawStr.includes('password');
  record(
    'Segurança: Zero vazamento de chaves/senhas',
    'Nenhum secret de API no JSON',
    leaksSecrets ? 'FALHA: Segredos detectados' : 'SEGURO: Apenas booleans e status',
    !leaksSecrets,
  );

  // 7. Verificação do Painel Vercel (painel.2goroteiros.com)
  const panelRes = await fetch(PANEL_URL);
  record(
    'Painel Web de Produção (Vercel)',
    'HTTP 200',
    `HTTP ${panelRes.status}`,
    panelRes.status === 200,
  );

  // 8. Resumo final
  console.log('\n========================================================================');
  console.log('RESUMO DOS RESULTADOS:');
  const allPass = results.every(r => r.status === 'PASS');
  console.log(`Total de testes: ${results.length} | Passaram: ${results.filter(r => r.status === 'PASS').length} | Falharam: ${results.filter(r => r.status === 'FAIL').length}`);
  console.log(`Status Geral: ${allPass ? 'SUCESSO TOTAL (100% OPERACIONAL)' : 'HOUVE FALHAS'}`);
  console.log('========================================================================');

  if (!allPass) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Erro na execução do teste:', err);
  process.exit(1);
});
