# 🚀 App Roteiros Core

> Backend oficial da plataforma App Roteiros

![NestJS](https://img.shields.io/badge/NestJS-Framework-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Prisma](https://img.shields.io/badge/Prisma-ORM-darkblue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED)
![Swagger](https://img.shields.io/badge/API-Swagger-green)
![Status](https://img.shields.io/badge/Status-Production%20Ready-success)

---

## 🌍 Visão Geral

O **App Roteiros Core** é o backend oficial da plataforma **App Roteiros**, servindo como a camada central de inteligência e negócio. O ecossistema é composto por três componentes integrados:

1. **Backend Core (NestJS API)**: Esta API REST, responsável pelas integrações com IA, persistência de dados, regras de negócio, autenticação e relatórios.
2. **Admin Web**: Painel administrativo web utilizado para gerenciar a base de dados de usuários, auditar requisições de IA, editar roteiros, gerenciar transações financeiras e analisar o faturamento e crescimento da plataforma.
3. **App Mobile**: Aplicação voltada para o cliente final para planejamento pessoal de viagens, colaboração e compra de acessos premium.

---

## 🏗️ Arquitetura

O sistema foi arquitetado visando escalabilidade, modularidade e segurança.

| Componente | Tecnologia | Detalhes / Papel no Projeto |
| :--- | :--- | :--- |
| **Framework Principal** | NestJS (v11) | Arquitetura modular estruturada em Controllers, Services e Modules. |
| **Linguagem** | TypeScript (v5) | Tipagem estática garantindo consistência no fluxo de dados. |
| **ORM** | Prisma (v7) | Tradução e modelagem de entidades do banco de dados relacional. |
| **Banco de Dados** | PostgreSQL (v15) | Armazenamento persistente de usuários, viagens, compras e logs. |
| **Segurança** | JWT, Helmet & Throttler | Proteção contra ataques comuns, limitação de requisições e RBAC. |
| **Mensageria / Upload** | Local Storage Provider | Serviço estruturado de uploads com validação por mime-type e tamanho. |
| **Integração IA** | OpenAI API | Geração automatizada de roteiros com base no perfil de viagem. |
| **Integração Mapas** | Google Places API | Pesquisa de atrações reais, geolocalização e enriquecimento de locais. |

---

## 📂 Módulos Existentes (App)

A API possui 13 módulos funcionais principais projetados para a experiência do usuário final e controle interno:

- **Auth**: Cadastro de contas (`/auth/signup`), login de usuários com tokens de acesso e refresh (`/auth/login`), renovação de credenciais (`/auth/refresh`) e expiração de sessões.
- **Users**: Recuperação e atualização de dados básicos de perfil (`/users/me`).
- **Travel Profile**: Gestão de preferências detalhadas de viagem (`/users/me/travel-profile`), contendo estilos (econômico, luxo, aventura), budget, preferências gastronômicas, acessibilidade, etc.
- **Trips**: CRUD completo de viagens (`/trips`). Controla título, destino, datas e status.
- **Trip Days**: Organização de dias de roteiro (`/trips/:id/days`) que subdividem uma viagem.
- **Itinerary**: Gestão e ordenação de atividades/atrações (`/trip-days/:id/items`) contendo horários, notas e custos.
- **Participants**: Sistema de convites (`/trips/:id/participants`) para planejamento compartilhado.
- **Places**: Integração de pesquisa de locais do Google Places e preenchimento automático.
- **Media**: Upload seguro de avatares e imagens de capa de viagem para o diretório `uploads`.
- **Billing**: Catálogo de produtos premium (`/products`) e fluxo de compras mockado (`/purchases`).
- **AI**: Geração automática de roteiros via OpenAI API com base no perfil.
- **Analytics**: Métricas básicas internas.
- **Health**: Endpoint de integridade do sistema (`/health`) que audita a saúde do banco de dados, da API e do sistema de arquivos.

---

## 👑 Módulos Administrativos

Os endpoints administrativos são prefixados por `/admin` e protegidos de forma robusta por `JwtAuthGuard`, `RolesGuard` e `@Roles(Role.ADMIN)`.

- **Admin Dashboard**: KPIs de negócio (`/admin/dashboard/overview`), faturamento e saúde dos serviços em tempo real.
- **Admin Users**: Controle completo da base de usuários, incluindo alteração de senha, exclusão/bloqueio, arquivamento e encerramento forçado de sessões.
- **Admin Trips**: Listagem geral paginada e detalhamento profundo de qualquer viagem do sistema, com filtros avançados.
- **Admin Itinerary Editor**: Edição de dias e itens de roteiro em nome de qualquer usuário.
- **Admin Participants & Premium**: Convidar/remover participantes e liberar/bloquear acesso premium manualmente de qualquer viagem.
- **Admin Base Trips**: Gestão de templates de roteiros pré-definidos (Base Trips) com seus dias, atrações e restaurantes recomendados.
- **Admin Billing**: Criação, edição e desativação de produtos no catálogo, além de auditoria geral de transações.
- **Admin AI**: Logs completos de auditoria e depuração de chamadas de IA (`/admin/ai-requests`).
- **Admin Places**: Enriquecimento geográfico administrativo de atrações e restaurantes base.
- **Admin Media**: Upload de imagens de capa para roteiros base e pontos turísticos.
- **Admin Analytics**: Análise de crescimento de usuários, geração de viagens e faturamento financeiro.

---

## 🔄 Fluxo da Plataforma

O diagrama abaixo ilustra a jornada de dados dentro da plataforma:

```text
  [ Usuário se Registra / Login (Auth) ]
                     ↓
  [ Configura Perfil de Viagem (Travel Profile) ]
                     ↓
  [ Cria uma Nova Viagem (Trips) ]
         ↙                       ↘
[ Roteiro Inteligente ]     [ Roteiro Manual ]
Geração automática via     Criação manual de dias
OpenAI com base no perfil   e itens de atrativos
         ↘                       ↙
  [ Enriquecimento de Dados Reais (Google Places API) ]
                     ↓
  [ Compartilhar com Amigos (Participants) ]
                     ↓
  [ Compra de Premium (Billing & Purchases) ]
                     ↓
  [ Auditoria & BI no Painel Admin (Dashboard / Analytics) ]
```

---

## 🗄️ Prisma & Modelagem de Dados

A persistência utiliza o Prisma Client integrado com o banco PostgreSQL.

* **Relacionamentos**: Os relacionamentos em cascata garantem a integridade dos dados (ex: deletar uma viagem remove automaticamente seus dias e itens de itinerário).
* **Entidades Principais**:
  * `User` & `RefreshToken`: Gestão de contas e sessões.
  * `UserTravelProfile`: Preferências de turismo ligadas ao usuário.
  * `Trip`, `TripDay` & `ItineraryItem`: Estrutura do roteiro dos usuários.
  * `BaseTrip`, `BaseTripDay`, `BaseAttraction` & `BaseRestaurant`: Catálogo de templates geridos por administradores.
  * `AIRequest`: Histórico completo de auditoria do uso de inteligência artificial.
  * `TripParticipant`: Registro de convites e compartilhamento de viagens.
  * `Product` & `Purchase`: Sistema financeiro e liberação premium.

---

## 📚 Documentação & Swagger

A documentação interativa da API está disponível via Swagger.

### Como acessar
Com a API rodando localmente, acesse:
```text
http://localhost:3000/api
```

### Divisão de Tags Documentadas
A especificação do Swagger divide os endpoints de forma organizada em 22 áreas:
* **Auth**: Fluxos de registro, login e renovação de tokens de acesso.
* **Users - App**: Detalhes da conta do usuário autenticado.
* **Travel Profile - App**: Gestão do perfil turístico do usuário.
* **Trips - App**: Viagens do usuário.
* **Trip Days - App**: Dias de viagem do usuário.
* **Itinerary - App**: Atividades planejadas em cada dia.
* **Participants - App**: Convidar e gerenciar participantes nas viagens.
* **Places - App**: Busca pública de locais usando a Google Places API.
* **Media - App**: Upload de avatar e imagem de capa do próprio usuário.
* **Billing - App**: Catálogo de produtos e compras do usuário.
* **System**: Rotas de integridade e Health Check do serviço (`/health`).
* **Admin - Dashboard**: Indicadores chaves (KPIs) e status do sistema.
* **Admin - Users**: Administração de contas de usuários (busca, bloqueio, arquivamento).
* **Admin - Trips**: Gerenciamento de viagens cadastradas na plataforma.
* **Admin - Itinerary Editor**: Controle administrativo de dias e itens de roteiro.
* **Admin - Participants & Premium**: Controle administrativo de membros e compras.
* **Admin - Base Trips**: Gestão de pacotes e templates de roteiros recomendados.
* **Admin - Billing**: Controle de faturamento e catálogo de produtos.
* **Admin - AI**: Depuração e logs de uso do OpenAI.
* **Admin - Places**: Enriquecimento geográfico de locais e atrativos.
* **Admin - Media**: Upload de imagens para roteiros base e pontos turísticos.
* **Admin - Analytics**: Gráficos e métricas de crescimento e faturamento.

---

## 🛠️ Setup Local (Desenvolvimento)

### Pré-requisitos
* Node.js v22 ou superior
* PostgreSQL v15 ou superior
* Chave de API OpenAI (para geração por IA)
* Chave de API Google Maps (para busca de locais)

### Passo a Passo

1. **Clonar o Repositório e Instalar Dependências**:
   ```bash
   git clone git@github.com:ronilsonbatista/app-roteiros-core.git
   cd app-roteiros-core
   npm install
   ```

2. **Configuração de Variáveis**:
   Crie o arquivo `.env` a partir do exemplo:
   ```bash
   cp .env.example .env
   ```
   Preencha as variáveis obrigatórias, incluindo a `DATABASE_URL`, segredos JWT e chaves de APIs de terceiros.

3. **Banco de Dados & Seed**:
   Execute as migrações para preparar as tabelas e gere o Prisma Client:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```
   Execute o seed para popular o banco de dados inicial (incluindo o usuário admin padrão):
   ```bash
   npm run seed
   ```

4. **Execução**:
   Inicie a aplicação em modo de desenvolvimento (com auto-reload):
   ```bash
   npm run start:dev
   ```

5. **Ferramentas Úteis**:
   Para visualizar os dados do banco graficamente, você pode abrir o Prisma Studio:
   ```bash
   npx prisma studio
   ```

---

## 🐳 Docker Compose

A plataforma está totalmente dockerizada para facilitar a inicialização de todo o ambiente local de desenvolvimento.

### Comandos Úteis do Docker

* **Construir Imagens**:
  ```bash
  docker compose build
  ```
* **Subir Ambiente em Background**:
  ```bash
  docker compose up -d
  ```
* **Acompanhar os Logs da API**:
  ```bash
  docker compose logs -f api
  ```
* **Parar e Remover Containers**:
  ```bash
  docker compose down
  ```

### Mapeamento de Serviços
* **API (approteiros_api)**: Rodando na porta **3000** com Node 22 Alpine.
* **Banco de Dados (approteiros_db)**: Rodando na porta **5433** do host com PostgreSQL 15 Alpine (evitando conflito com uma instalação PostgreSQL local que utilize a porta padrão 5432).

---

## 🔑 Usuário Admin Padrão

Ao rodar o seed do banco de dados (no setup local ou na inicialização automática do Docker), o seguinte usuário administrador é provisionado na base de dados para testes iniciais:

* **E-mail**: `admin@2go.com`
* **Senha**: `admin123`
* **Nome**: `DockerAdmin`

> [!WARNING]  
> Estas credenciais são exclusivas para fins de desenvolvimento, homologação local e sandbox. Modifique-as antes de realizar qualquer deploy em ambientes de produção!

---

## 📈 Status Atual & Roadmap

### Status de Desenvolvimento

| Módulo / Camada | Status | Observação |
| :--- | :--- | :--- |
| **Backend Core API** | 🟢 Production Ready | 100% dos endpoints implementados, documentados e validados via testes de regressão. |
| **Admin Web (Frontend)** | 🔄 Em Desenvolvimento | Integração das telas do painel aos novos endpoints administrativos (`/admin`). |
| **App Mobile (Frontend)** | 🔄 Em Desenvolvimento | Fase de desenvolvimento das telas do usuário final e integração com a API. |

### Roadmap (Próximos Passos)

* **OpenAI Avançado**: Geração contínua e iterativa de roteiros, permitindo que o usuário dê feedback em partes específicas e o robô adapte apenas o dia selecionado.
* **Google Places Avançado (Caching)**: Criar uma camada de cache local de Places, minimizando o custo com chamadas redundantes da API do Google Maps.
* **Monetização Real**: Substituir o mock provider por uma integração real com provedores (ex: Stripe ou Asaas) via Webhooks.
* **Aplicativo Nativo**: Empacotamento do App Mobile para distribuição oficial nas lojas Apple App Store e Google Play Store.

---

## 👨‍💻 Desenvolvido por

**Ronilson Batista**  
*Fundador e desenvolvedor principal da plataforma App Roteiros.*
