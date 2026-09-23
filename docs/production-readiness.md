# 2GO — Production Readiness & Infrastructure Tracking (Phase D2)

Documento mestre de rastreamento do estado técnico, decisões de infraestrutura e prontidão pré-lançamento de Produção para o ecossistema 2GO.

---

## 1. Baselines de Repositórios & Git

| Repositório | Path Local | Branch | HEAD Verificado | Status |
|---|---|---|---|---|
| **Admin** | `~/.gemini/antigravity/scratch/app-roteiros-admin` | `main` | `981226c` | Clean, certificado |
| **Core / API** | `~/.gemini/antigravity/scratch/approteiros-api` | `main` | `0d2c94e` | Clean, 1 commit à frente de `0d68c9f` (migration guestJourneyId) |
| **Mobile** | `~/Documents/2go-mobile` | `main` | `3c9923f` | READ-ONLY durante D2 |

---

## 2. Ambiente STAGING (Certificado D1.2)

- **Railway Project:** `2GO STAGING` (ID: `9e7f7c87-b737-4da9-8c98-b44a80b80914`)
- **Public Core URL:** `https://core-api-production-50ce.up.railway.app`
- **Swagger Staging:** `https://core-api-production-50ce.up.railway.app/api`
- **Health Staging:** `https://core-api-production-50ce.up.railway.app/health`
- **Mercado Pago Webhook (TEST):** `https://core-api-production-50ce.up.railway.app/webhooks/mercadopago`
- **Admin Staging:** `https://app-roteiros-admin.vercel.app` (Vercel, Team `2go`)
- **Database:** PostgreSQL 16 no Railway (19 migrações Prisma aplicadas)
- **Status Certificação D1.2:** APROVADO (OpenAI, Google Places, Mercado Pago TEST PIX/Cartão/Webhook, Admin Staging)

---

## 3. Ambiente PRODUCTION (Alvo da Fase D2)

- **Railway Project:** `2GO PRODUCTION` (A ser provisionado)
- **Railway Project ID:** Pendente criação
- **Production PostgreSQL:** Novo banco PostgreSQL 16 isolado (zero dados de staging)
- **Production Core Service:** `core-api`
- **Production Core URL:** Pendente provisionamento
- **Production Admin Project:** Vercel (projeto separado apontando para Core Prod)
- **Production Admin URL:** Pendente provisionamento
- **Production Webhook:** `<PRODUCTION_CORE_URL>/webhooks/mercadopago`

---

## 4. Auditoria de Blockers de Produção & Soluções

| Item | Situação Staging | Requisito Produção | Solução D2 |
|---|---|---|---|
| **Email / OTP** | `MockEmailService` (emite OTP no stdout) | Provedor real transacional, OTP jamais exposto em logs ou respostas | Implementar adapter `ResendEmailService`, fail-closed em produção se mock |
| **Media Storage** | `LocalMediaStorageProvider` (`/uploads` efêmero no container) | Armazenamento de objetos persistente | Implementar `S3MediaStorageProvider` (compatível com S3/Railway Buckets/R2) |
| **Health Endpoint** | Expõe status de OpenAI, Google Maps, uploads | Resposta mínima `{ "status": "OK" }` | Hardening condicional a `NODE_ENV === 'production'` |
| **CORS** | Staging admin + localhost | Somente origem do Admin de Produção (sem wildcard) | Validação fail-closed em `main.ts` |
| **Swagger** | Habilitado em staging | Desabilitado por padrão (`SWAGGER_ENABLED=false`) | Já existente em `main.ts` |
| **Mercado Pago** | Credenciais TEST / Sandbox | Credenciais de Produção (modo PROD) | Gate de credenciais / ativação do usuário |
| **Admin Seed / Bootstrap** | `SEED_ADMIN_EMAIL`/`PASSWORD` | Admin bootstrap seguro com senha forte via env | Suportado via `prisma/seed.ts` seguro |
| **Product Seed** | `ITINERARY_FULL_ACCESS` R$ 29,90 | Preço comercial aprovado | User gate se preço diferir de R$ 29,90 |
| **Database Backups** | N/A | Estratégia e runbook de restore documentados | Documentar rotina de backup no Railway |

---

## 5. Matriz de Variáveis de Ambiente

| Variável | Staging | Production | Categoria | Status |
|---|---|---|---|---|
| `NODE_ENV` | `staging` | `production` | SAME_NON_SECRET | Planejado |
| `PORT` | Dinâmico (Railway) | Dinâmico (Railway) | SAME_NON_SECRET | Suportado |
| `DATABASE_URL` | Staging Postgres | Production Postgres | NEW_PRODUCTION_SECRET | Pendente DB Prod |
| `JWT_SECRET` | Staging secret | Novo secret criptográfico | NEW_PRODUCTION_SECRET | A gerar (64 bytes hex) |
| `JWT_REFRESH_SECRET` | Staging refresh secret | Novo secret criptográfico | NEW_PRODUCTION_SECRET | A gerar (64 bytes hex) |
| `JWT_EXPIRES_IN` | `15m` | `15m` | SAME_NON_SECRET | Pronto |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | `7d` | SAME_NON_SECRET | Pronto |
| `CORS_ORIGINS` | Staging admin, localhost | Production admin URL | DIFFERENT_NON_SECRET | Pendente URL Admin Prod |
| `SWAGGER_ENABLED` | `true` | `false` | DIFFERENT_NON_SECRET | Pronto |
| `BILLING_MOCK_PAYMENTS_ENABLED` | `false` | `false` | SAME_NON_SECRET | Pronto |
| `PAYMENT_PROVIDER` | `mercadopago` | `mercadopago` | SAME_NON_SECRET | Pronto |
| `MERCADO_PAGO_ACCESS_TOKEN` | Staging (TEST) | Prod Token | NEW_PRODUCTION_SECRET | User Gate |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Staging Webhook Secret | Prod Webhook Secret | NEW_PRODUCTION_SECRET | User Gate |
| `OPENAI_API_KEY` | Staging Key | Prod Key | NEW_PRODUCTION_SECRET | User Gate |
| `OPENAI_MODEL` | `gpt-4o-mini` | `gpt-4o-mini` | SAME_NON_SECRET | Pronto |
| `GOOGLE_MAPS_API_KEY` | Staging Key | Prod Key | NEW_PRODUCTION_SECRET | User Gate |
| `EMAIL_PROVIDER` | `mock` | `resend` | DIFFERENT_NON_SECRET | A implementar |
| `RESEND_API_KEY` | N/A | Prod Resend Key | NEW_PRODUCTION_SECRET | User Gate |
| `EMAIL_FROM` | N/A | `2GO <noreply@...>` | DIFFERENT_NON_SECRET | A configurar |
| `MEDIA_STORAGE_PROVIDER` | `local` | `s3` | DIFFERENT_NON_SECRET | A implementar |
| `S3_ENDPOINT` | N/A | Railway/S3 Endpoint | DIFFERENT_NON_SECRET | A configurar |
| `S3_REGION` | N/A | Region | DIFFERENT_NON_SECRET | A configurar |
| `S3_BUCKET` | N/A | Prod Bucket Name | DIFFERENT_NON_SECRET | A configurar |
| `S3_ACCESS_KEY_ID` | N/A | Storage Access Key | NEW_PRODUCTION_SECRET | A configurar |
| `S3_SECRET_ACCESS_KEY` | N/A | Storage Secret Key | NEW_PRODUCTION_SECRET | A configurar |
| `MEDIA_BASE_URL` | Staging URL/uploads | S3/CDN Public URL | DIFFERENT_NON_SECRET | A configurar |

---

## 6. Histórico de Execuções e Validações

*Será atualizado incrementalmente ao longo da fase D2.*
