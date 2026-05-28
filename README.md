# 🚀 App Roteiros Core

> Backend oficial da plataforma App Roteiros

![NestJS](https://img.shields.io/badge/NestJS-Framework-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Prisma](https://img.shields.io/badge/Prisma-ORM-darkblue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)
![Swagger](https://img.shields.io/badge/API-Swagger-green)
![Status](https://img.shields.io/badge/Status-MVP%20Concluído-success)

---

# 🌍 Sobre o Projeto

O **App Roteiros Core** é o backend oficial da plataforma **App Roteiros**, responsável por toda a camada de negócio da aplicação.

A plataforma foi desenvolvida para permitir que viajantes criem, personalizem, compartilhem e consumam roteiros inteligentes utilizando Inteligência Artificial, Google Places e dados personalizados de viagem.

---

# ✨ Principais Funcionalidades

### 🔐 Autenticação e Segurança

* JWT Authentication
* Refresh Tokens
* Role Based Access Control (RBAC)
* Controle de bloqueio de usuários
* Proteção de rotas
* Rate Limiting
* Helmet Security

### 👤 Gestão de Usuários

* Cadastro
* Login
* Perfil de viagem
* Preferências personalizadas
* Compartilhamento de roteiros

### ✈️ Gestão de Roteiros

* Trips
* Trip Days
* Itinerary Items
* Roteiros Base
* Compartilhamento entre usuários
* Participantes convidados

### 🤖 Inteligência Artificial

* Integração OpenAI
* Geração automática de roteiros
* Personalização baseada no perfil do usuário
* Histórico e auditoria de requisições

### 🗺️ Google Places

* Busca de locais
* Enriquecimento de atrações
* Coordenadas geográficas
* Avaliações e informações oficiais

### 📸 Media

* Avatar de usuário
* Imagens de roteiros
* Upload de templates
* Storage Provider Pattern

### 💳 Billing

* Catálogo de produtos
* Compras
* Mock Payment Provider
* Controle de desbloqueio premium

### 📊 Analytics

* Crescimento de usuários
* Crescimento de roteiros
* Consumo de IA
* Destinos mais buscados
* Monitoramento operacional

### 🛠️ Administração

* Gestão de usuários
* Gestão de roteiros base
* Gestão de IA
* Gestão de produtos
* Dashboard administrativo

---

# 🧰 Tecnologias

### Backend

* NestJS
* TypeScript
* Passport
* JWT

### Banco de Dados

* PostgreSQL
* Prisma ORM

### Infraestrutura

* Docker
* Docker Compose
* Uploads Locais
* Health Checks

### Integrações

* OpenAI API
* Google Places API

---

# 📚 Documentação

## Swagger

Após iniciar a aplicação:

```bash
npm run start:dev
```

Acesse:

```text
http://localhost:3000/api
```

---

## Health Check

```text
http://localhost:3000/health
```

---

# 🛠 Setup Local (Desenvolvimento)

## Pré-requisitos

* Node.js 22+
* PostgreSQL
* Docker (opcional)
* Chave OpenAI
* Chave Google Places

---

## Instalação

Clone o repositório:

```bash
git clone git@github.com:ronilsonbatista/app-roteiros-core.git
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

---

## Banco de Dados

Execute as migrations:

```bash
npx prisma migrate dev
```

Gere o Prisma Client:

```bash
npx prisma generate
```

---

## Seed Inicial

Criação automática do usuário administrador:

```bash
npm run seed
```

Variáveis obrigatórias:

```env
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=
```

---

## Rodando Localmente

```bash
npm run start:dev
```

API:

```text
http://localhost:3000
```

Swagger:

```text
http://localhost:3000/api
```

---

# 🐳 Docker

Build:

```bash
docker compose build
```

Subir ambiente:

```bash
docker compose up -d
```

Ver logs:

```bash
docker compose logs -f
```

Swagger:

```text
http://localhost:3000/api
```

Health:

```text
http://localhost:3000/health
```

---

# 🔐 Variáveis Obrigatórias

A aplicação realiza validação de startup e não sobe em produção caso alguma variável obrigatória esteja ausente.

Principais:

```env
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=
JWT_REFRESH_EXPIRES_IN=
OPENAI_API_KEY=
OPENAI_MODEL=
GOOGLE_MAPS_API_KEY=
MEDIA_STORAGE_PROVIDER=
MEDIA_BASE_URL=
CORS_ORIGINS=
```

---

# 📂 Estrutura dos Módulos

```text
src/
├── auth
├── users
├── travel-profile
├── trips
├── trip-days
├── itinerary
├── base-trips
├── ai
├── places
├── media
├── participants
├── billing
├── analytics
├── admin
└── prisma
```

---

# 💡 Comandos Úteis

| Comando                | Descrição                       |
| ---------------------- | ------------------------------- |
| npm run start:dev      | Executa em modo desenvolvimento |
| npm run build          | Compila o projeto               |
| npm run start:prod     | Executa build de produção       |
| npm run seed           | Cria usuário administrador      |
| npx prisma studio      | Interface visual do banco       |
| npx prisma migrate dev | Executa migrations              |
| npx prisma generate    | Gera Prisma Client              |

---

# 📈 Status do Projeto

## MVP Backend

* ✅ Auth
* ✅ RBAC
* ✅ Travel Profile
* ✅ Trips
* ✅ Base Trips
* ✅ AI
* ✅ Google Places
* ✅ Media Upload
* ✅ Participants
* ✅ Billing
* ✅ Analytics
* ✅ Docker
* ✅ Swagger
* ✅ Health Checks

**Status Atual:** 🚀 MVP Backend concluído e em fase de homologação.

---

# 👨‍💻 Desenvolvido por

**Ronilson Batista**

Fundador da plataforma App Roteiros.
