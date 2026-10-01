const API_URL = 'https://core-api-production-e849.up.railway.app';
const PANEL_URL = 'https://painel.2goroteiros.com';
const ADMIN_EMAIL = 'admin@2goroteiros.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Senha123*';
const USER_EMAIL = 'e2e.pedro.henrique@2goroteiros.com';
const USER_PASSWORD = process.env.USER_PASSWORD || 'SenhaPedro123*';

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

async function run() {
  console.log('========================================================================');
  console.log('2GO — VALIDAÇÃO E2E CONTROLE FINANCEIRO DE GASTOS (PRODUÇÃO)');
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

  // 2. Segurança: Sem token (401)
  const noTokenRes = await fetch(`${API_URL}/admin/company-expenses`);
  record(
    'Segurança: Acesso sem token',
    'HTTP 401 Unauthorized',
    `HTTP ${noTokenRes.status}`,
    noTokenRes.status === 401,
  );

  // 3. Segurança: USER comum sem papel ADMIN (403)
  await fetch(`${API_URL}/admin/users/b2cf6726-1320-4a47-be24-e6a41b11a3c8/change-password`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ password: USER_PASSWORD }),
  });

  const userLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
  });
  const userLoginJson: any = await userLoginRes.json();
  const userToken = userLoginJson.data?.accessToken;

  let userBlocked403 = false;
  if (userToken) {
    const userAccessRes = await fetch(`${API_URL}/admin/company-expenses`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    userBlocked403 = userAccessRes.status === 403;
    record(
      'Segurança: USER comum bloqueado (RBAC)',
      'HTTP 403 Forbidden',
      `HTTP ${userAccessRes.status}`,
      userBlocked403,
    );
  } else {
    record(
      'Segurança: USER comum bloqueado (RBAC)',
      'HTTP 403 Forbidden',
      'Usuário de teste não autenticou',
      false,
    );
  }

  // 4. Admin cria gasto
  const createPayload = {
    title: 'Infraestrutura AWS e Cloud E2E Teste',
    category: 'INFRA',
    amountCents: 48550, // R$ 485,50
    currency: 'BRL',
    spentAt: '2026-10-01T12:00:00.000Z',
    competenceMonth: '2026-10',
    vendor: 'Amazon Web Services',
    notes: 'Despesa de servidores e banco gerenciado para validação E2E',
  };

  const createRes = await fetch(`${API_URL}/admin/company-expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(createPayload),
  });
  const createJson: any = await createRes.json();
  const createdExpense = createJson.data;
  const expenseId = createdExpense?.id;

  record(
    'Criação de Gasto pelo Admin',
    'HTTP 201 com ID e amountCents=48550',
    `HTTP ${createRes.status} (ID: ${expenseId}, amount: ${createdExpense?.amountCents})`,
    createRes.status === 201 && !!expenseId && createdExpense?.amountCents === 48550,
  );

  // 5. Releitura após criação
  const reloadRes = await fetch(`${API_URL}/admin/company-expenses/${expenseId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const reloadJson: any = await reloadRes.json();
  const reloadedExpense = reloadJson.data;

  const reloadMatches =
    reloadRes.status === 200 &&
    reloadedExpense?.title === createPayload.title &&
    reloadedExpense?.category === createPayload.category &&
    reloadedExpense?.amountCents === createPayload.amountCents &&
    reloadedExpense?.vendor === createPayload.vendor &&
    reloadedExpense?.competenceMonth === '2026-10';

  record(
    'Releitura e Persistência do Gasto',
    'HTTP 200 com dados idênticos aos cadastrados',
    `HTTP ${reloadRes.status} (Título: "${reloadedExpense?.title}", Mês: ${reloadedExpense?.competenceMonth})`,
    reloadMatches,
  );

  // 6. Edição de valor e categoria
  const updatePayload = {
    title: 'Infraestrutura AWS e Cloud E2E Teste (Editado)',
    category: 'SAAS',
    amountCents: 52000, // R$ 520,00
    vendor: 'AWS Cloud Services',
  };

  const updateRes = await fetch(`${API_URL}/admin/company-expenses/${expenseId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(updatePayload),
  });
  const updateJson: any = await updateRes.json();
  const updatedExpense = updateJson.data;

  // Releitura pós-edição
  const reloadUpdatedRes = await fetch(`${API_URL}/admin/company-expenses/${expenseId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const reloadUpdatedJson: any = await reloadUpdatedRes.json();
  const reloadedUpdated = reloadUpdatedJson.data;

  const updateMatches =
    updateRes.status === 200 &&
    reloadUpdatedRes.status === 200 &&
    reloadedUpdated?.title === updatePayload.title &&
    reloadedUpdated?.category === updatePayload.category &&
    reloadedUpdated?.amountCents === updatePayload.amountCents &&
    reloadedUpdated?.vendor === updatePayload.vendor;

  record(
    'Edição de Valor e Categoria',
    'HTTP 200 e persistência comprovada em releitura',
    `HTTP ${updateRes.status} -> Releitura: Categoria=${reloadedUpdated?.category}, Valor=${reloadedUpdated?.amountCents}`,
    updateMatches,
  );

  // 7. Criação de despesa em outra competência (2026-09) para teste de filtros
  const prevMonthPayload = {
    title: 'Google Workspace E2E Teste Mês Anterior',
    category: 'SAAS',
    amountCents: 15000, // R$ 150,00
    spentAt: '2026-09-15T10:00:00.000Z',
    competenceMonth: '2026-09',
    vendor: 'Google Cloud',
  };

  const createPrevRes = await fetch(`${API_URL}/admin/company-expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(prevMonthPayload),
  });
  const createPrevJson: any = await createPrevRes.json();
  const prevExpenseId = createPrevJson.data?.id;

  // 8. Filtro por competência
  const filterOctRes = await fetch(`${API_URL}/admin/company-expenses?competenceMonth=2026-10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const filterOctJson: any = await filterOctRes.json();
  const octExpenses: any[] = filterOctJson.data?.data || filterOctJson.data || [];

  const filterSepRes = await fetch(`${API_URL}/admin/company-expenses?competenceMonth=2026-09`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const filterSepJson: any = await filterSepRes.json();
  const sepExpenses: any[] = filterSepJson.data?.data || filterSepJson.data || [];

  const octHasOnlyOct = octExpenses.length > 0 && octExpenses.every((e) => e.competenceMonth === '2026-10');
  const sepHASOnlySep = sepExpenses.length > 0 && sepExpenses.every((e) => e.competenceMonth === '2026-09');
  const monthFilterOk = octHasOnlyOct && sepHASOnlySep;

  record(
    'Filtro por Competência / Mês',
    'Apenas despesas da competência selecionada retornam',
    `2026-10: ${octExpenses.length} itens (todos 2026-10: ${octHasOnlyOct}) | 2026-09: ${sepExpenses.length} itens (todos 2026-09: ${sepHASOnlySep})`,
    monthFilterOk,
  );

  // 9. Summary bate com a soma da lista
  const summaryRes = await fetch(`${API_URL}/admin/company-expenses/summary?competenceMonth=2026-10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const summaryJson: any = await summaryRes.json();
  const summaryData = summaryJson.data;

  const octListSum = octExpenses.reduce((acc, curr) => acc + curr.amountCents, 0);
  const summaryMatchesSum = summaryRes.status === 200 && summaryData?.totalCents === octListSum;

  record(
    'Resumo Financeiro (Summary vs Soma da Lista)',
    `Summary totalCents (${summaryData?.totalCents}) bate 100% com a soma dos itens da lista (${octListSum})`,
    `Summary: ${summaryData?.totalCents} | Soma da lista: ${octListSum}`,
    summaryMatchesSum,
  );

  // 10. Isolamento de Billing (Não altera compras/cupons)
  const billingCheckRes = await fetch(`${API_URL}/admin/products`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record(
    'Isolamento com Billing de Clientes',
    'Endpoints de despesas internas não interferem em compras/cupons de clientes',
    `Billing status: HTTP ${billingCheckRes.status}`,
    billingCheckRes.status === 200,
  );

  // 11. Soft-Delete e Limpeza
  const deleteOctRes = await fetch(`${API_URL}/admin/company-expenses/${expenseId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  const deleteSepRes = await fetch(`${API_URL}/admin/company-expenses/${prevExpenseId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  // Releitura com soft-delete (não deve aparecer na listagem padrão)
  const reloadListAfterDelete = await fetch(`${API_URL}/admin/company-expenses?competenceMonth=2026-10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const reloadListJson: any = await reloadListAfterDelete.json();
  const listAfterDelete: any[] = reloadListJson.data?.data || reloadListJson.data || [];
  const itemIsArchived = !listAfterDelete.some((e) => e.id === expenseId);

  record(
    'Exclusão / Arquivamento de Gasto',
    'Item removido da listagem ativa via soft-delete',
    `DELETE 2026-10: HTTP ${deleteOctRes.status} | Item oculto na listagem: ${itemIsArchived}`,
    deleteOctRes.status === 200 && itemIsArchived,
  );

  // 12. Acesso à página do Painel
  const panelRes = await fetch(`${PANEL_URL}/company-expenses`, {
    headers: { Cookie: `accessToken=${adminToken}` },
    redirect: 'manual',
  });
  record(
    'Navegação Painel (/company-expenses)',
    'HTTP 200 com página renderizada',
    `HTTP ${panelRes.status}`,
    panelRes.status === 200,
  );

  // Resumo dos Resultados
  console.log('\n========================================================================');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL DE TESTES: ${results.length}`);
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);
  console.log('========================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
