# 2GO — Production Readiness & Infrastructure Tracking (Phase D2)

Documento mestre de rastreamento do estado técnico, decisões de infraestrutura e prontidão pré-lançamento de Produção para o ecossistema 2GO.

---

## 1. Baselines de Repositórios & Git

| Repositório | Path Local | Branch | HEAD Verificado | Status |
|---|---|---|---|---|
| **Admin** | `~/.gemini/antigravity/scratch/app-roteiros-admin` | `main` | `981226c` | Clean, certificado |
| **Core / API** | `~/.gemini/antigravity/scratch/approteiros-api` | `main` | `5a41323` | Clean, migrado, D2 providers implementados e testados (15 test suites, 71 tests PASS) |
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
- **Status Certificação D1.2:** APROVADO (Zero blockers abertos em Staging)

---

## 3. Ambiente PRODUCTION (Infraestrutura D2 Provisionada)

- **Railway Project:** `2GO PRODUCTION`
- **Railway Project ID:** `888a5674-29fe-4630-827f-b535d5e4effa`
- **Railway Environment:** `production` (`9145bf6b-a341-4571-9e85-278b41c1a316`)
- **Production PostgreSQL:**
  - Service ID: `f1049abf-e5d7-495c-94d6-07783fc64fd1`
  - Isolamento: 100% isolado (zero dados de staging, 0 users, 0 trips, 0 purchases)
  - Migrações: 19 migrações aplicadas via `prisma migrate deploy`
  - Backups Contínuos: PITR (Point-In-Time Recovery) ATIVADO (`bucketWired: true`)
- **Production Media Storage (S3-compatible Object Storage):**
  - Bucket ID: `8bc6694e-c8da-46d8-a4ea-f2acfae26ced`
  - Bucket Name: `uploads-sn0hd2utrwu9a1l0a`
  - Endpoint: `https://t3.storageapi.dev`
  - Region: `auto`
  - Status: Conectado e configurado no `core-api` (não-efêmero)
- **Production Core Service:**
  - Service ID: `aefac16c-469c-4182-a128-1b3f4ddc6b9d`
  - Public Core URL: `https://core-api-production-e849.up.railway.app`
  - Webhook URL de Produção: `https://core-api-production-e849.up.railway.app/webhooks/mercadopago`
- **Production Admin Project (Vercel):**
  - Project ID: `prj_lrgdpIdhcM6O67Qy8N0QPBh3BxzA`
  - Project Name: `app-roteiros-admin-prod` (Team `2go`)
  - Public Admin URL: `https://app-roteiros-admin-prod.vercel.app`
  - `NEXT_PUBLIC_API_URL`: `https://core-api-production-e849.up.railway.app`
  - Deployment Protection / SSO: Desativado para acesso operacional direto

---

## 4. Runbook de Backup & Restore (PostgreSQL Produção)

### 4.1 Estratégia de Backup
- **Mecanismo:** Point-in-Time Recovery (PITR) contínuo nativo da Railway integrado com bucket de armazenamento de objetos dedicado.
- **Frequência:** Contínua (WAL archiving) + snapshots periódicos.
- **Retenção:** Padrão gerenciado pela plataforma (7 dias).

### 4.2 Procedimento de Restore (PITR)
Em caso de corrupção ou necessidade de restauração para um ponto específico no tempo:
```bash
# 1. Obter status do PITR
railway postgres pitr status -s f1049abf-e5d7-495c-94d6-07783fc64fd1

# 2. Restaurar para timestamp específico
railway postgres pitr restore -s f1049abf-e5d7-495c-94d6-07783fc64fd1 --time "<TIMESTAMP_ISO_8601>"
```

### 4.3 Procedimento de Dump Lógico Manual
```bash
# Exportar dump lógico do banco de produção (via TCP proxy)
pg_dump "postgresql://${USER}:${PASSWORD}@${TCP_PROXY_DOMAIN}:${TCP_PROXY_PORT}/${DB}?sslmode=require" -Fc > backup_prod_$(date +%Y%m%d_%H%M%S).dump

# Restaurar dump lógico
pg_restore -d "postgresql://${USER}:${PASSWORD}@${TCP_PROXY_DOMAIN}:${TCP_PROXY_PORT}/${DB}?sslmode=require" --clean backup_file.dump
```

---

## 5. Matriz de Variáveis de Ambiente (Produção vs Staging)

| Variável | Staging | Production | Categoria | Status em Produção |
|---|---|---|---|---|
| `NODE_ENV` | `staging` | `production` | SAME_NON_SECRET | Configurado |
| `PORT` | Dinâmico | Dinâmico | SAME_NON_SECRET | Pronto |
| `DATABASE_URL` | Staging Postgres | Production Postgres (`${{Postgres.DATABASE_URL}}`) | NEW_PRODUCTION_SECRET | Configurado & Migrado (19 migrações) |
| `JWT_SECRET` | Staging secret | Novo secret criptográfico (64 bytes hex) | NEW_PRODUCTION_SECRET | Configurado isolado |
| `JWT_REFRESH_SECRET` | Staging secret | Novo secret criptográfico (64 bytes hex) | NEW_PRODUCTION_SECRET | Configurado isolado |
| `JWT_EXPIRES_IN` | `15m` | `15m` | SAME_NON_SECRET | Configurado |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | `7d` | SAME_NON_SECRET | Configurado |
| `CORS_ORIGINS` | Staging Admin, local | `https://app-roteiros-admin-prod.vercel.app` | DIFFERENT_NON_SECRET | Configurado restrito |
| `SWAGGER_ENABLED` | `true` | `false` | DIFFERENT_NON_SECRET | Configurado (desabilitado) |
| `BILLING_MOCK_PAYMENTS_ENABLED` | `false` | `false` | SAME_NON_SECRET | Configurado |
| `PAYMENT_PROVIDER` | `mercadopago` | `mercadopago` | SAME_NON_SECRET | Configurado |
| `MEDIA_STORAGE_PROVIDER` | `local` | `s3` | DIFFERENT_NON_SECRET | Configurado |
| `S3_ENDPOINT` | N/A | `https://t3.storageapi.dev` | DIFFERENT_NON_SECRET | Configurado |
| `S3_REGION` | N/A | `auto` | DIFFERENT_NON_SECRET | Configurado |
| `S3_BUCKET` | N/A | `uploads-sn0hd2utrwu9a1l0a` | DIFFERENT_NON_SECRET | Configurado |
| `S3_ACCESS_KEY_ID` | N/A | S3 Access Key | NEW_PRODUCTION_SECRET | Configurado |
| `S3_SECRET_ACCESS_KEY` | N/A | S3 Secret Key | NEW_PRODUCTION_SECRET | Configurado |
| `MEDIA_BASE_URL` | Staging /uploads | `https://t3.storageapi.dev/uploads-sn0hd2utrwu9a1l0a` | DIFFERENT_NON_SECRET | Configurado |
| `EMAIL_PROVIDER` | `mock` | `resend` | DIFFERENT_NON_SECRET | Configurado |
| `RESEND_API_KEY` | N/A | Prod API Key | NEW_PRODUCTION_SECRET | **USER GATE** |
| `EMAIL_FROM` | N/A | `2GO Travel <noreply@2gotravel.app>` | DIFFERENT_NON_SECRET | Padrão no código |
| `OPENAI_API_KEY` | Staging Key | Prod Key | NEW_PRODUCTION_SECRET | **USER GATE** |
| `OPENAI_MODEL` | `gpt-4o-mini` | `gpt-4o-mini` | SAME_NON_SECRET | Configurado |
| `GOOGLE_MAPS_API_KEY` | Staging Key | Prod Key | NEW_PRODUCTION_SECRET | **USER GATE** |
| `MERCADO_PAGO_ACCESS_TOKEN` | Staging TEST Token | Prod Token | NEW_PRODUCTION_SECRET | **USER GATE** |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Staging Secret | Prod Webhook Secret | NEW_PRODUCTION_SECRET | **USER GATE** |
| `SEED_ADMIN_EMAIL` | Staging Email | Prod Admin Email | NEW_PRODUCTION_SECRET | **USER GATE** |
| `SEED_ADMIN_PASSWORD` | Staging Password | Prod Admin Password | NEW_PRODUCTION_SECRET | **USER GATE** |
| Preço `ITINERARY_FULL_ACCESS` | R$ 29,90 | A confirmar (se R$ 29,90 ou outro) | COMMERCIAL_PRICING | **USER GATE** |

---

## 6. Veredito Parcial D2

- `PRODUCTION_PROJECT_SEPARATE` = SIM (`888a5674-29fe-4630-827f-b535d5e4effa`)
- `PRODUCTION_DB_SEPARATE` = SIM (`f1049abf-e5d7-495c-94d6-07783fc64fd1`)
- `MIGRATIONS_COMPLETE` = SIM (19 de 19 aplicadas)
- `STAGING_DATA_IN_PRODUCTION` = NÃO (Zero registros em todas as tabelas)
- `STAGING_SECRETS_REUSED` = NÃO (Novos JWTs 64-byte hex e novas credenciais de storage)
- `MOCK_EMAIL_ACTIVE_PRODUCTION` = NÃO (`ResendEmailService` implementado, Mock fail-closed)
- `OTP_LOGGED_PRODUCTION` = NÃO (MockEmailService bloqueado em prod; Resend não loga código)
- `EPHEMERAL_MEDIA_PRODUCTION` = NÃO (Bucket S3 dedicado provisionado e configurado)
- `SWAGGER_PUBLIC_PRODUCTION` = NÃO (`SWAGGER_ENABLED=false`)
- `CORS_WILDCARD_PRODUCTION` = NÃO (Restrito a `https://app-roteiros-admin-prod.vercel.app`)
- `PRODUCTION_ADMIN_WORKING` = SIM (`https://app-roteiros-admin-prod.vercel.app` ativo)
- `BACKUP_STRATEGY_EXISTS` = SIM (PITR contínuo ativo + runbook documentado)
- `RELEASE_BLOCKERS_OPEN` = 5 (Credenciais externas de Produção: OpenAI, Google Places, Mercado Pago, Resend, Preço/Admin Seed)
