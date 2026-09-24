# 2GO — Production Readiness & Infrastructure Audit (Fase D2)

**Data da Auditoria:** 23/09/2026  
**Status do Projeto:** Fase D2 — Preparação de Infraestrutura de Produção (Pré-Credenciais Externas Concluída)  
**Ambientes:**
- **Staging (Certificado D1.2):** 100% Funcional e Preservado
- **Production (D2):** Infraestrutura Provisionada, Hardening Aplicado, Isolamento Garantido

---

## 1. Baselines de Repositórios & Git

| Repositório | Path Local | Branch | HEAD Verificado | Status |
|---|---|---|---|---|
| **Admin** | `~/.gemini/antigravity/scratch/app-roteiros-admin` | `main` | `981226c` | Clean, certificado |
| **Core / API** | `~/.gemini/antigravity/scratch/approteiros-api` | `main` | `main` | Clean, compilando, 16 test suites / 80 testes PASS |
| **Mobile** | `~/Documents/2go-mobile` | `main` | `3c9923f` | READ-ONLY durante D2 (não modificado) |

---

## 2. Auditoria Técnica Pré-Credenciais (D2 Pre-Credentials Review)

### 2.1 Railway S3 Media — Prova Real de File Serving
- **Privacidade do Bucket:** Confirmada. Os buckets Railway Storage (Tigris) são privados por padrão (acesso direto via URL estática retorna HTTP 403 Forbidden).
- **Estratégia de Disponibilização Adotada:** **BACKEND_PROXY** (`GET /media/file/:folder/:filename` e `GET /media/file/:filename`, com fallback transparente em `GET /uploads/*`).
  - A API autentica diretamente no bucket via AWS SDK v3 (`GetObjectCommand`) e faz stream do arquivo com headers corretos (`Content-Type`, `Content-Length`, `Cache-Control: public, max-age=31536000, immutable`).
  - URLs persistidas no banco e retornadas nos endpoints de upload: `https://core-api-production-e849.up.railway.app/media/file/<folder>/<uuid>.<ext>`.
  - Consumidores (Mobile Expo `<Image />` e Admin Web `<img />`) recebem URLs públicas e duráveis sem necessidade de renovação contínua de presigned URLs.
- **Teste de Fumaça Real em Produção (Smoke Test):**
  - Objeto de teste real enviado para o bucket de produção `uploads-sn0hd2utrwu9a1l0a` via SDK.
  - Download realizado pelo mecanismo exato da aplicação: HTTP 200 OK.
  - Verificação de Content-Type: `text/plain; charset=utf-8` (correspondência exata).
  - Verificação de Integridade de Conteúdo: correspondência exata byte a byte.
  - Acesso direto sem credenciais testado: HTTP 403 Forbidden confirmado.
  - Objeto de teste deletado do bucket e confirmação de remoção limpa (`NoSuchKey` / 404).
- **Veredito de Mídia:**
  - `MEDIA_UPLOAD_REAL = PASS`
  - `MEDIA_READ_REAL = PASS`
  - `MEDIA_PUBLIC_BUCKET_REQUIRED = NO`
  - `MEDIA_SERVING_STRATEGY = BACKEND_PROXY`
  - `MEDIA_PRODUCTION_BLOCKER = NO`

### 2.2 Resend Email Fail-Closed em Produção
- **Políticas em `NODE_ENV=production`:**
  - `RESEND_API_KEY` obrigatório: Ausência aborta o bootstrap da API (`process.exit(1)`) e rejeita instanciação.
  - `EMAIL_FROM` obrigatório: Ausência aborta o bootstrap da API e rejeita instanciação.
  - Remetente de desenvolvimento (`onboarding@resend.dev`) é **estritamente rejeitado** em produção.
  - `MockEmailService` não pode ser instanciado em produção (lança exceção fatal imediata).
  - `EmailModule` rejeita resolução de mock em produção.
  - Código OTP **nunca é registrado em logs** (`Logger` ou `stdout`): testes unitários com spy confirmam que o código gerado não vaza.
- **Veredito de E-mail:**
  - `EMAIL_PRODUCTION_FAIL_CLOSED = PASS`
  - `EMAIL_FROM_REQUIRED_PRODUCTION = YES`
  - `MOCK_EMAIL_PRODUCTION_IMPOSSIBLE = YES`
  - `OTP_LOG_PRODUCTION_IMPOSSIBLE = YES`

### 2.3 Ciclo de Vida do Secret de Bootstrap do Admin
- `SEED_ADMIN_PASSWORD` é tratado como um **segredo temporário de bootstrap operacional**, não uma configuração de runtime permanente.
- **Fluxo do Ciclo de Vida:**
  1. Configurar credenciais temporárias de bootstrap nas variáveis da Railway (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`).
  2. Executar bootstrap explícito do banco (`npm run prisma:seed` ou `railway run -- npx ts-node prisma/seed.ts`).
  3. Verificar criação do usuário admin e persistência do `passwordHash` (bcrypt salt rounds = 10) no PostgreSQL.
  4. **Remover imediatamente `SEED_ADMIN_PASSWORD`** das variáveis de ambiente da Railway.
  5. Remover `SEED_ADMIN_EMAIL` se não for mais necessário operacionalmente.
  6. Reiniciar o serviço. O login do Admin continua operando normalmente, pois a autenticação valida contra o hash no PostgreSQL.
- **Garantias de Segurança:**
  - Senha nunca é registrada em logs ou salva em texto puro.
  - Seed é idempotente: se o e-mail do admin já existir, o seed não altera o usuário nem redefine a senha.
  - Inexistência de qualquer endpoint público de criação de admin.

### 2.4 Preço Comercial do Produto (USER GATE)
- O valor de staging (`R$ 29,90`) **não é assumido como autoritativo para Produção**.
- No seed de produção, `ITINERARY_FULL_ACCESS` não é criado a menos que a variável `SEED_PRODUCT_PRICE` seja explicitamente informada pelo proprietário.
- Permanece como **USER GATE** comercial.

### 2.5 PITR / Runbook de Recuperação (PostgreSQL Produção)
- **Status do Archiver:** ATIVO e SAUDÁVEL.
  - `pgbackrest-watcher` em execução no container Postgres da Railway.
  - WAL archiver enviando arquivos continuamente para o bucket `postgres-pitr-hvunycxjzqi` com 0 falhas (`failed=0`, `lag=0`, `gap_state=clear`).
  - Base backup inicial concluído com sucesso em `2026-09-23 21:58:53 UTC` (`last_full=1790200733`).
- **Janela de Retenção:** Padrão Railway pgbackrest (7 dias).
- **Modelo de Custo:** Armazenamento em Object Storage Tigris a ~$0.02/GB/mês (< $0.05/mês no volume inicial de 133MB).
- **Procedimento de Restauração:**
  1. **Dashboard Railway:** Projeto `2GO PRODUCTION` -> Serviço `Postgres` -> Backups -> Restaurar para ponto no tempo.
  2. **Dump Lógico:** Backup lógico via TCP proxy:
     ```bash
     pg_dump "postgresql://postgres:<PASSWORD>@sakura.proxy.rlwy.net:33701/railway?sslmode=require" -Fc > prod_backup_$(date +%Y%m%d).dump
     ```
- **Veredito PITR:**
  - `PITR_ENABLED = SIM`
  - `PITR_HEALTHY = SIM`
  - `BASE_BACKUP_AVAILABLE = SIM`
  - `RESTORE_RUNBOOK_DOCUMENTED = SIM`

---

## 3. Ambiente STAGING (Certificado D1.2)

- **Railway Project:** `2GO STAGING` (ID: `9e7f7c87-b737-4da9-8c98-b44a80b80914`)
- **Public Core URL:** `https://core-api-production-50ce.up.railway.app`
- **Swagger Staging:** `https://core-api-production-50ce.up.railway.app/api`
- **Health Staging:** `https://core-api-production-50ce.up.railway.app/health`
- **Admin Staging:** `https://app-roteiros-admin.vercel.app` (Vercel, Team `2go`)
- **Status Certificação D1.2:** APROVADO e 100% PRESERVADO.

---

## 4. Ambiente PRODUCTION (Infraestrutura Provisionada)

- **Railway Project:** `2GO PRODUCTION` (`888a5674-29fe-4630-827f-b535d5e4effa`)
- **Railway Environment:** `production` (`9145bf6b-a341-4571-9e85-278b41c1a316`)
- **Production PostgreSQL:**
  - Service ID: `f1049abf-e5d7-495c-94d6-07783fc64fd1`
  - Isolamento: 100% isolado (0 rows em todas as tabelas)
  - Migrações: 19 migrações Prisma aplicadas
  - Backups: PITR ativo e saudável (`last_full` disponível, WAL push contínuo)
  - TCP Proxy: `sakura.proxy.rlwy.net:33701`
- **Production Media Storage (S3 / Tigris):**
  - Bucket: `uploads-sn0hd2utrwu9a1l0a` (`8bc6694e-c8da-46d8-a4ea-f2acfae26ced`)
  - Endpoint: `https://t3.storageapi.dev`
  - Credenciais: configuradas de forma isolada na Railway
  - File Serving: Backend Media Proxy comprovado
- **Production Core Service:**
  - Service ID: `aefac16c-469c-4182-a128-1b3f4ddc6b9d`
  - Domain: `https://core-api-production-e849.up.railway.app`
  - Webhook URL: `https://core-api-production-e849.up.railway.app/webhooks/mercadopago`
  - Media Proxy: `https://core-api-production-e849.up.railway.app/media/file`
- **Production Admin (Vercel):**
  - Project ID: `prj_lrgdpIdhcM6O67Qy8N0QPBh3BxzA`
  - Domain: `https://app-roteiros-admin-prod.vercel.app`
  - API Target: `https://core-api-production-e849.up.railway.app`

---

## 5. Matriz de Variáveis de Ambiente de Produção

| Variável | Categoria | Configurado em Produção | Pendente / User Gate |
|---|---|---|---|
| `NODE_ENV` | Non-Secret | `production` | Não |
| `PORT` | Non-Secret | Dinâmico Railway | Não |
| `DATABASE_URL` | Secret | `${{Postgres.DATABASE_URL}}` | Não |
| `JWT_SECRET` | Secret | 64-byte hex isolado | Não |
| `JWT_REFRESH_SECRET` | Secret | 64-byte hex isolado | Não |
| `JWT_EXPIRES_IN` | Non-Secret | `15m` | Não |
| `JWT_REFRESH_EXPIRES_IN` | Non-Secret | `7d` | Não |
| `CORS_ORIGINS` | Non-Secret | `https://app-roteiros-admin-prod.vercel.app` | Não |
| `SWAGGER_ENABLED` | Non-Secret | `false` | Não |
| `BILLING_MOCK_PAYMENTS_ENABLED` | Non-Secret | `false` | Não |
| `PAYMENT_PROVIDER` | Non-Secret | `mercadopago` | Não |
| `MEDIA_STORAGE_PROVIDER` | Non-Secret | `s3` | Não |
| `MEDIA_BASE_URL` | Non-Secret | `https://core-api-production-e849.up.railway.app/media/file` | Não |
| `S3_ENDPOINT` | Non-Secret | `https://t3.storageapi.dev` | Não |
| `S3_REGION` | Non-Secret | `auto` | Não |
| `S3_BUCKET` | Non-Secret | `uploads-sn0hd2utrwu9a1l0a` | Não |
| `S3_ACCESS_KEY_ID` | Secret | Configurado no serviço | Não |
| `S3_SECRET_ACCESS_KEY` | Secret | Configurado no serviço | Não |
| `EMAIL_PROVIDER` | Non-Secret | `resend` | Não |
| `OPENAI_MODEL` | Non-Secret | `gpt-4o-mini` | Não |
| `RESEND_API_KEY` | Secret | Sim (Restrito envio) | Não |
| `EMAIL_FROM` | Non-Secret / Config | `2GO <administrativo@2goroteiros.com>` | Não |
| `OPENAI_API_KEY` | Secret | Não | **SIM (USER GATE)** |
| `GOOGLE_MAPS_API_KEY` | Secret | Não | **SIM (USER GATE)** |
| `MERCADO_PAGO_ACCESS_TOKEN` | Secret | Não | **SIM (USER GATE)** |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Secret | Não | **SIM (USER GATE)** |
| `SEED_ADMIN_EMAIL` | Bootstrap | Executado e Removido | Não |
| `SEED_ADMIN_PASSWORD` | Bootstrap | Executado e Removido | Não |
| `SEED_PRODUCT_PRICE` | Comercial | Não | **SIM (USER GATE confirmação)** |

---

## 6. Auditoria de Fechamento Fase D2 (Production Providers & Certification)

Data da Auditoria: 24/09/2026

### 6.1 Status dos Provedores e Gates de Produção
- **OpenAI:**
  - `OPENAI_API_KEY`: **ABSENT**
  - Modelo configurado: `OPENAI_MODEL=gpt-4o-mini`
  - Veredito: `OPENAI_PROD_CONFIGURED = NO`, `OPENAI_PRODUCTION = FAIL` (pendente chave de produção).
- **Google Places:**
  - `GOOGLE_MAPS_API_KEY`: **ABSENT**
  - Veredito: `GOOGLE_PLACES_PROD_CONFIGURED = NO`, `GOOGLE_PLACES_PRODUCTION = FAIL` (pendente chave de produção).
  - Restrição de chaves: `PROVIDER_DASHBOARD_REVIEW_REQUIRED` (GCP Console).
- **Mercado Pago:**
  - `MERCADO_PAGO_ACCESS_TOKEN`: **ABSENT**
  - `MERCADO_PAGO_WEBHOOK_SECRET`: **ABSENT**
  - `PAYMENT_PROVIDER`: `mercadopago` (Configurado)
  - `BILLING_MOCK_PAYMENTS_ENABLED`: `false` (Mocks bloqueados)
  - Endpoint Webhook Produção: `https://core-api-production-e849.up.railway.app/webhooks/mercadopago` (Ativo e validado)
  - Rejeição de Assinatura Inválida / Ausente: **PASS** (HTTP 403 Forbidden fail-closed verificado)
  - Veredito: `MERCADO_PAGO_PRODUCTION_CONFIGURED = NO`, `MERCADO_PAGO_REAL_CHARGE_EXECUTED = NO`, `MERCADO_PAGO_WEBHOOK_SECURITY = PASS`.
- **Preço de Produto (USER GATE):**
  - `SEED_PRODUCT_PRICE`: **ABSENT**
  - Produto: `ITINERARY_FULL_ACCESS` (`Acesso Completo ao Roteiro`)
  - Veredito: `PRODUCT_PRODUCTION_SEEDED = NO` (aguardando valor oficial do operador).
- **Resend Email:**
  - `RESEND_API_KEY`: Configurado na Railway (Restrito a envio de emails).
  - `EMAIL_FROM`: `2GO <administrativo@2goroteiros.com>`.
  - Teste de Envio Transacional Real: HTTP 403 retornado pelo Resend informando que o domínio `2goroteiros.com` ainda não concluiu a verificação DNS.
  - Veredito: `RESEND_DOMAIN_VERIFIED = NO`, `RESEND_REAL_DELIVERY = FAIL` (aguarda propagação/validação DNS no dashboard do Resend).

### 6.2 Integridade e Regressão de Produção
- **PostgreSQL PITR:** Saudável e ativo (`last_full` disponível, 0 falhas, 0 lag).
- **Media Serving:** Proxy `GET /media/file/:filename` ativo e respondendo conforme esperado.
- **Health Check:** `GET /health` -> `{"status":"OK"}` (Produção minimalista).
- **Swagger:** `GET /api` -> 404 Not Found (Desativado em produção).
- **CORS:** Restrito à origem de produção `https://app-roteiros-admin-prod.vercel.app`, rejeitando origens externas e sem wildcard.
- **Banco de Produção:**
  - Usuários Admin: 1 (`administrativo@2goroteiros.com`)
  - Usuários Finais: 0
  - Viagens: 0
  - Compras: 0
  - Webhook Events: 0
  - Contaminação de Staging: 0
- **Staging Regression:** Totalmente preservado (`https://core-api-production-50ce.up.railway.app/health` OK).
