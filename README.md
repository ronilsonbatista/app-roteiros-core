# AppRoteiros - API Backend

Este repositório contém a API do AppRoteiros, responsável pela gestão de usuários, geração de roteiros de viagens via IA, integrações com o Google Places e painel administrativo.

## Tecnologias Principais
- NestJS (TypeScript)
- Prisma (ORM)
- PostgreSQL
- Autenticação via JWT / Passport
- Integração com OpenAI (GPT-4) e Google Maps
- Docker e Docker Compose

---

## 🛠 Setup Local (Desenvolvimento)

### Pré-requisitos
- Node.js v18 ou v20
- Docker e Docker Compose (opcional para o banco de dados)
- Conta na OpenAI (com chave de API) e Conta GCP (com Google Places)

### Instalação
1. Clone o repositório.
2. Instale as dependências:
   \`\`\`bash
   npm install
   \`\`\`
3. Crie o seu arquivo `.env` copiando o exemplo e preencha as variáveis mandatórias:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

### Migrations e Banco de Dados
Com o banco de dados PostgreSQL rodando, aplique o estado atual da base localmente e gere as tipagens do Prisma Client:
\`\`\`bash
npx prisma migrate dev
\`\`\`

### Seed (Criando o Admin)
Para testar a administração localmente, você precisa de um usuário com privilégio `ADMIN`. O seed usa as variáveis `SEED_ADMIN_*` configuradas no seu `.env`:
\`\`\`bash
npm run seed
\`\`\`

### Rodando o Servidor Localmente
\`\`\`bash
npm run start:dev
\`\`\`
A API estará acessível em `http://localhost:3000`. E a documentação interativa (Swagger) em `http://localhost:3000/api`.

---

## 🐳 Setup via Docker (Produção / Homologação)

A API e o banco de dados estão perfeitamente isolados numa orquestração Docker Compose para deploys fáceis. O container rodará todas as *migrations* dinamicamente durante a inicialização (através do nosso entrypoint) antes de aceitar requisições.

1. Preencha o arquivo `.env.docker` caso queira customizar credenciais.
2. Faça o Build e Up:
   \`\`\`bash
   docker-compose up --build -d
   \`\`\`

Isso inicializará o servidor de banco de dados na rede docker, com exposição port-forwarding local na `5433` (pra evitar conflitos com Postgres local na `5432`). O server node aceitará tráfego na porta `3000`.

---

## 🔐 Variáveis de Ambiente Mandatórias

Sem estas variáveis preenchidas, a aplicação lançará crash intencional no startup garantindo que nada suba com estado corrompido:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `MEDIA_STORAGE_PROVIDER`
- `MEDIA_BASE_URL`
- `CORS_ORIGINS` (Obrigatório caso em modo \`production\`)

---

## 💡 Comandos Rápidos

| Comando | Descrição |
| --- | --- |
| \`npm run build\` | Compila o TS para JS na pasta \`dist/\` |
| \`npm run start:prod\` | Roda o script de produção com PM2 ou Node nativo |
| \`npm run seed\` | Roda o script limpo de mock-admin inicial |
| \`npx prisma studio\` | Abre uma UI para gestão da base de dados |
# app-roteiros-core
# app-roteiros-core
# app-roteiros-core
# app-roteiros-core
# app-roteiros-core
# app-roteiros-core
# app-roteiros-core
