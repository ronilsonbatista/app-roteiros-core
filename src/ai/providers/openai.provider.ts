import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  AIProvider,
  GenerateItineraryInput,
  GenerateGuestItineraryInput,
  AIProviderResult,
} from './ai-provider.interface';
import { ItineraryCategory } from '@prisma/client';
import OpenAI from 'openai';

export function inferCurrency(destinationName?: string): string | null {
  const norm = (destinationName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/japao|japan|toquio|tokyo|quioto|kyoto|osaka|hiroshima|nara|hokkaido|fukuoka/.test(norm)) return 'JPY';
  if (/coreia|korea|seul|seoul|busan/.test(norm)) return 'KRW';
  if (/tailandia|thailand|bangkok|bangcoc|phuket|chiang mai|krabi/.test(norm)) return 'THB';
  if (
    /italia|italy|roma|rome|milao|milan|florenca|florence|veneza|venice|napoles|franca|france|paris|espanha|spain|madrid|barcelona|portugal|lisboa|porto|alemanha|germany|berlim|grecia|greece|atenas|holanda|amsterdam|austria|viena|irlanda|dublin|belgica|bruxelas|finlandia|helsinki|europa/.test(
      norm,
    )
  )
    return 'EUR';
  if (/reino unido|united kingdom|londres|london|inglaterra|england|escocia|scotland/.test(norm)) return 'GBP';
  if (/estados unidos|usa|united states|nova york|new york|miami|orlando|los angeles|san francisco|las vegas|chicago/.test(norm)) return 'USD';
  if (/brasil|brazil|rio de janeiro|sao paulo|salvador|florianopolis|fortaleza|recife|curitiba|brasilia|belo horizonte|manaus|fernando de noronha/.test(norm)) return 'BRL';
  if (/argentina|buenos aires|mendoza|bariloche/.test(norm)) return 'ARS';
  if (/chile|santiago|valparaiso|atacama/.test(norm)) return 'CLP';
  if (/mexico|cancun|cidade do mexico|mexico city/.test(norm)) return 'MXN';
  if (/canada|toronto|vancouver|montreal/.test(norm)) return 'CAD';
  if (/australia|sydney|melbourne/.test(norm)) return 'AUD';
  if (/suica|switzerland|zurique|genebra/.test(norm)) return 'CHF';
  if (/emirados|emirates|dubai|abu dhabi/.test(norm)) return 'AED';
  return null;
}

function normalizeCategory(category: string): ItineraryCategory {
  const upper = String(category || '').toUpperCase().trim();
  const valid = Object.values(ItineraryCategory);
  if (valid.includes(upper as ItineraryCategory)) {
    return upper as ItineraryCategory;
  }
  if (upper.includes('BREAKFAST') || upper.includes('CAFE') || upper.includes('COFFEE') || upper.includes('PADARIA')) {
    return ItineraryCategory.CAFE;
  }
  if (upper.includes('LUNCH') || upper.includes('DINNER') || upper.includes('ALMOCO') || upper.includes('JANTAR') || upper.includes('RESTAURANTE')) {
    return ItineraryCategory.RESTAURANT;
  }
  if (upper.includes('BAR') || upper.includes('PUB') || upper.includes('ROOFTOP')) {
    return ItineraryCategory.BAR;
  }
  if (upper.includes('NIGHT') || upper.includes('NOITE') || upper.includes('BALADA')) {
    return ItineraryCategory.NIGHTLIFE;
  }
  if (upper.includes('MUSEU') || upper.includes('MUSEUM') || upper.includes('GALERIA')) {
    return ItineraryCategory.MUSEUM;
  }
  if (upper.includes('PARK') || upper.includes('PARQUE') || upper.includes('JARDIM')) {
    return ItineraryCategory.PARK;
  }
  if (upper.includes('PRAIA') || upper.includes('BEACH')) {
    return ItineraryCategory.BEACH;
  }
  if (upper.includes('SHOP') || upper.includes('COMPRA') || upper.includes('MERCADO')) {
    return ItineraryCategory.SHOPPING;
  }
  if (upper.includes('TRANS') || upper.includes('VOO') || upper.includes('TREM') || upper.includes('SHINKANSEN') || upper.includes('METRO') || upper.includes('AEROPORTO')) {
    return ItineraryCategory.TRANSPORT;
  }
  if (upper.includes('EVENT') || upper.includes('SHOW')) {
    return ItineraryCategory.EVENT;
  }
  if (upper.includes('EXP') || upper.includes('TOUR') || upper.includes('PASSEIO') || upper.includes('CAMINHADA')) {
    return ItineraryCategory.EXPERIENCE;
  }
  return ItineraryCategory.TOURIST_ATTRACTION;
}

@Injectable()
export class OpenAIProvider implements AIProvider {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly model: string;

  constructor() {
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.openai = null as any;
      this.logger.warn(
        'OpenAI API Key is not configured. AI integration will fail if called.',
      );
    }
  }

  async generateItinerary(
    input: GenerateItineraryInput,
  ): Promise<AIProviderResult> {
    if (!this.openai) {
      throw new Error(
        'OpenAI API Key is not configured. Please set the OPENAI_API_KEY environment variable.',
      );
    }

    const { numberOfDays } = input;

    // Single chunk for short itineraries (<= 5 days)
    if (numberOfDays <= 5) {
      return this.executeSingleItinerary(input);
    }

    // Multi-chunk orchestrated generation for long itineraries (> 5 days)
    return this.executeChunkedItinerary(input);
  }

  async generateGuestItinerary(
    input: GenerateGuestItineraryInput,
  ): Promise<AIProviderResult> {
    if (!this.openai) {
      throw new Error(
        'OpenAI API Key is not configured. Please set the OPENAI_API_KEY environment variable.',
      );
    }

    const totalDays = this.calculateGuestTotalDays(input);

    if (totalDays <= 5) {
      return this.executeSingleGuestItinerary(input);
    }

    return this.executeChunkedGuestItinerary(input, totalDays);
  }

  private calculateGuestTotalDays(input: GenerateGuestItineraryInput): number {
    let days = 0;
    for (const d of input.destinations || []) {
      if (d.numberOfDays && d.numberOfDays > 0) {
        days += d.numberOfDays;
      } else if (d.arrivalDate && d.departureDate) {
        const start = new Date(d.arrivalDate).getTime();
        const end = new Date(d.departureDate).getTime();
        const diff = Math.ceil((end - start) / (1000 * 3600 * 24)) + 1;
        days += Math.max(1, diff);
      } else {
        days += 3;
      }
    }
    return Math.max(1, days || 3);
  }

  // ==========================================
  // SINGLE GENERATION (Short trips <= 5 days)
  // ==========================================

  private async executeSingleItinerary(
    input: GenerateItineraryInput,
  ): Promise<AIProviderResult> {
    const prompt = this.buildPrompt(input);
    this.logger.log(
      `Calling OpenAI (Single chunk) for ${input.destination} (${input.numberOfDays} days) with model ${this.model}`,
    );

    const response = await this.openai.chat.completions.create(
      {
        model: this.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      },
      { timeout: 90000, maxRetries: 1 },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new BadRequestException('A OpenAI retornou uma resposta vazia.');
    }

    const parsedData = JSON.parse(content);
    const normalizedDays = this.normalizeDays(
      parsedData.days || [],
      input.destination,
      input.numberOfDays,
    );

    return {
      rawResponse: content,
      parsedData: { days: normalizedDays },
      tokensUsed: response.usage?.total_tokens || 0,
      model: response.model || this.model,
      provider: 'OPENAI',
    };
  }

  private async executeSingleGuestItinerary(
    input: GenerateGuestItineraryInput,
  ): Promise<AIProviderResult> {
    const prompt = this.buildGuestPrompt(input);
    const primaryDest = input.destinations?.[0]?.name || 'Destino';
    this.logger.log(
      `Calling OpenAI Guest (Single chunk) for ${primaryDest} with model ${this.model}`,
    );

    const response = await this.openai.chat.completions.create(
      {
        model: this.model,
        messages: [
          { role: 'system', content: this.getGuestSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      },
      { timeout: 90000, maxRetries: 1 },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new BadRequestException('A OpenAI retornou uma resposta vazia.');
    }

    const parsedData = JSON.parse(content);
    const totalDays = this.calculateGuestTotalDays(input);
    const normalizedDays = this.normalizeDays(
      parsedData.days || [],
      primaryDest,
      totalDays,
    );

    return {
      rawResponse: content,
      parsedData: { days: normalizedDays },
      tokensUsed: response.usage?.total_tokens || 0,
      model: response.model || this.model,
      provider: 'OPENAI',
    };
  }

  // ==========================================
  // CHUNKED GENERATION (Long trips > 5 days)
  // ==========================================

  private async executeChunkedItinerary(
    input: GenerateItineraryInput,
  ): Promise<AIProviderResult> {
    const { numberOfDays, destination } = input;
    const chunks = this.planItineraryChunks(input);

    this.logger.log(
      `Iniciando geração de roteiro longo (${numberOfDays} dias) em ${chunks.length} etapas sequenciais para máxima estabilidade e qualidade.`,
    );

    let totalTokens = 0;
    const chunkResults: any[][] = [];

    for (const chunk of chunks) {
      this.logger.log(
        `Disparando etapa: Dias ${chunk.startDay} a ${chunk.endDay} (${chunk.city || destination})...`,
      );

      const chunkPrompt = this.buildChunkPrompt(input, chunk);
      let attempts = 0;
      const maxAttempts = 3;
      let chunkSuccess = false;

      while (attempts < maxAttempts && !chunkSuccess) {
        attempts++;
        try {
          const response = await this.openai.chat.completions.create(
            {
              model: this.model,
              messages: [
                { role: 'system', content: this.getSystemPrompt() },
                { role: 'user', content: chunkPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.7,
            },
            { timeout: 90000, maxRetries: 2 },
          );

          totalTokens += response.usage?.total_tokens || 0;
          const content = response.choices[0]?.message?.content;
          if (!content) throw new Error('Resposta vazia da OpenAI no chunk');

          const parsed = JSON.parse(content);
          const rawChunkDays = Array.isArray(parsed.days) ? parsed.days : [];

          const expectedCount = chunk.endDay - chunk.startDay + 1;
          if (rawChunkDays.length !== expectedCount) {
            throw new Error(
              `Esperava ${expectedCount} dias no chunk, recebeu ${rawChunkDays.length}`,
            );
          }

          const processedDays: any[] = [];
          rawChunkDays.forEach((d: any, idx: number) => {
            const currentDayNumber = chunk.startDay + idx;
            d.dayNumber = currentDayNumber;
            if (!d.destination) d.destination = chunk.city || destination;
            processedDays.push(d);
          });

          this.logger.log(
            `Etapa Dias ${chunk.startDay} a ${chunk.endDay} (${chunk.city || destination}) concluída com sucesso!`,
          );
          chunkResults.push(processedDays);
          chunkSuccess = true;
        } catch (err: any) {
          this.logger.warn(
            `Falha na etapa Dias ${chunk.startDay}-${chunk.endDay} (tentativa ${attempts}/${maxAttempts}): ${err.message}`,
          );
          if (attempts >= maxAttempts) {
            throw new BadRequestException(
              `Falha na geração detalhada dos dias ${chunk.startDay} a ${chunk.endDay}: ${err.message}`,
            );
          }
        }
      }
    }

    const allDays = chunkResults.flat();
    allDays.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0));

    if (allDays.length !== numberOfDays) {
      throw new BadRequestException(
        `O roteiro longo resultou em ${allDays.length} dias, mas eram esperados ${numberOfDays}.`,
      );
    }

    const normalizedDays = this.normalizeDays(allDays, destination, numberOfDays);

    return {
      rawResponse: JSON.stringify({ days: normalizedDays }),
      parsedData: { days: normalizedDays },
      tokensUsed: totalTokens,
      model: this.model,
      provider: 'OPENAI',
    };
  }

  private async executeChunkedGuestItinerary(
    input: GenerateGuestItineraryInput,
    totalDays: number,
  ): Promise<AIProviderResult> {
    const chunks = this.planGuestChunks(input, totalDays);
    const primaryDest = input.destinations?.[0]?.name || 'Destino';

    this.logger.log(
      `Iniciando geração GuestJourney longa (${totalDays} dias) em ${chunks.length} etapas paralelas.`,
    );

    let totalTokens = 0;

    const chunkResults = await Promise.all(
      chunks.map(async (chunk) => {
        this.logger.log(
          `Disparando etapa Guest: Dias ${chunk.startDay} a ${chunk.endDay} (${chunk.city})...`,
        );

        const chunkPrompt = this.buildGuestChunkPrompt(input, chunk, totalDays);
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          attempts++;
          try {
            const response = await this.openai.chat.completions.create(
              {
                model: this.model,
                messages: [
                  { role: 'system', content: this.getGuestSystemPrompt() },
                  { role: 'user', content: chunkPrompt },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.7,
              },
              { timeout: 120000, maxRetries: 2 },
            );

            totalTokens += response.usage?.total_tokens || 0;
            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error('Resposta vazia da OpenAI no chunk');

            const parsed = JSON.parse(content);
            const rawChunkDays = Array.isArray(parsed.days) ? parsed.days : [];
            const expectedCount = chunk.endDay - chunk.startDay + 1;

            if (rawChunkDays.length !== expectedCount) {
              throw new Error(
                `Esperava ${expectedCount} dias no chunk, recebeu ${rawChunkDays.length}`,
              );
            }

            const processedDays: any[] = [];
            rawChunkDays.forEach((d: any, idx: number) => {
              const currentDayNumber = chunk.startDay + idx;
              d.dayNumber = currentDayNumber;
              if (!d.destination) d.destination = chunk.city;
              processedDays.push(d);
            });

            this.logger.log(
              `Etapa Guest Dias ${chunk.startDay} a ${chunk.endDay} (${chunk.city}) concluída!`,
            );
            return processedDays;
          } catch (err: any) {
            this.logger.warn(
              `Falha na etapa Guest Dias ${chunk.startDay}-${chunk.endDay} (tentativa ${attempts}/${maxAttempts}): ${err.message}`,
            );
            if (attempts >= maxAttempts) {
              throw new BadRequestException(
                `Falha na geração detalhada dos dias ${chunk.startDay} a ${chunk.endDay}: ${err.message}`,
              );
            }
          }
        }
        return [];
      }),
    );

    const allDays = chunkResults.flat();
    allDays.sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0));

    if (allDays.length !== totalDays) {
      throw new BadRequestException(
        `O roteiro Guest resultou em ${allDays.length} dias, mas eram esperados ${totalDays}.`,
      );
    }

    const normalizedDays = this.normalizeDays(allDays, primaryDest, totalDays);

    return {
      rawResponse: JSON.stringify({ days: normalizedDays }),
      parsedData: { days: normalizedDays },
      tokensUsed: totalTokens,
      model: this.model,
      provider: 'OPENAI',
    };
  }

  // ==========================================
  // CHUNK PLANNING HELPERS
  // ==========================================

  private planItineraryChunks(input: GenerateItineraryInput): Array<{
    startDay: number;
    endDay: number;
    city: string;
    isFirst: boolean;
    isLast: boolean;
    previousCity?: string;
  }> {
    const { numberOfDays, destination, travelProfile } = input;
    const destinations =
      input.destinations || travelProfile?.destinations || travelProfile?.tripPreferences?.destinations;

    if (Array.isArray(destinations) && destinations.length > 1) {
      const chunks: any[] = [];
      let currentDay = 1;
      let prevCity: string | undefined = undefined;

      for (let i = 0; i < destinations.length; i++) {
        const dest = destinations[i];
        const daysInCity = dest.numberOfDays || dest.days || 3;
        const startDay = currentDay;
        const endDay = Math.min(numberOfDays, currentDay + daysInCity - 1);

        chunks.push({
          startDay,
          endDay,
          city: dest.city || dest.name,
          isFirst: i === 0,
          isLast: i === destinations.length - 1 || endDay >= numberOfDays,
          previousCity: prevCity,
        });

        prevCity = dest.city || dest.name;
        currentDay = endDay + 1;
        if (currentDay > numberOfDays) break;
      }
      return chunks;
    }

    // Default uniform chunking by 3-4 days
    const chunks: any[] = [];
    const chunkSize = 3;
    let day = 1;

    while (day <= numberOfDays) {
      const startDay = day;
      const endDay = Math.min(numberOfDays, day + chunkSize - 1);
      chunks.push({
        startDay,
        endDay,
        city: destination,
        isFirst: startDay === 1,
        isLast: endDay === numberOfDays,
      });
      day = endDay + 1;
    }

    return chunks;
  }

  private planGuestChunks(
    input: GenerateGuestItineraryInput,
    totalDays: number,
  ): Array<{
    startDay: number;
    endDay: number;
    city: string;
    isFirst: boolean;
    isLast: boolean;
    previousCity?: string;
  }> {
    const destinations = input.destinations || [];
    if (destinations.length > 1) {
      const chunks: any[] = [];
      let currentDay = 1;
      let prevCity: string | undefined = undefined;

      for (let i = 0; i < destinations.length; i++) {
        const dest = destinations[i];
        let daysInCity = dest.numberOfDays || 3;
        if (dest.arrivalDate && dest.departureDate) {
          const s = new Date(dest.arrivalDate).getTime();
          const e = new Date(dest.departureDate).getTime();
          daysInCity = Math.max(1, Math.ceil((e - s) / (1000 * 3600 * 24)) + 1);
        }
        const startDay = currentDay;
        const endDay = Math.min(totalDays, currentDay + daysInCity - 1);

        chunks.push({
          startDay,
          endDay,
          city: dest.city || dest.name,
          isFirst: i === 0,
          isLast: i === destinations.length - 1 || endDay >= totalDays,
          previousCity: prevCity,
        });

        prevCity = dest.city || dest.name;
        currentDay = endDay + 1;
        if (currentDay > totalDays) break;
      }
      return chunks;
    }

    const chunks: any[] = [];
    const chunkSize = 3;
    let day = 1;

    while (day <= totalDays) {
      const startDay = day;
      const endDay = Math.min(totalDays, day + chunkSize - 1);
      chunks.push({
        startDay,
        endDay,
        city: destinations[0]?.name || 'Destino',
        isFirst: startDay === 1,
        isLast: endDay === totalDays,
      });
      day = endDay + 1;
    }

    return chunks;
  }

  // ==========================================
  // NORMALIZATION
  // ==========================================

  private normalizeDays(
    rawDays: any[],
    defaultDestination: string,
    expectedCount: number,
  ): any[] {
    return rawDays.map((day: any, idx: number) => {
      const dayNumber = day.dayNumber || idx + 1;
      const dayDest = day.destination || defaultDestination;
      const localCurrency = inferCurrency(dayDest);

      const items = Array.isArray(day.items) ? day.items : [];
      const normalizedItems = items.map((item: any, itemIdx: number) => {
        const category = normalizeCategory(item.category);
        const costNum = Number(item.cost ?? item.estimatedCost ?? 0);
        const validCost = Number.isFinite(costNum) ? Math.max(0, costNum) : 0;
        const itemCurrency = item.currency || localCurrency || null;

        const timeLabel =
          item.timeLabel &&
          typeof item.timeLabel === 'string' &&
          item.timeLabel.trim()
            ? item.timeLabel.trim()
            : null;

        const duration = Number.isFinite(Number(item.duration))
          ? Number(item.duration)
          : this.inferDuration(category, item.period);

        return {
          title: String(item.title || 'Experiência').trim(),
          category,
          timeLabel,
          duration,
          period: String(item.period || 'Manhã').trim(),
          location: String(item.location || dayDest).trim(),
          description: String(item.description || '').trim(),
          cost: validCost,
          currency: itemCurrency ? String(itemCurrency).toUpperCase().trim() : null,
          notes: String(item.notes || '').trim(),
          sourceType: item.sourceType || 'AI',
          sourceId: item.sourceId || null,
          providerPlaceId: item.providerPlaceId || null,
          order: itemIdx + 1,
        };
      });

      return {
        dayNumber,
        date: day.date,
        destination: dayDest,
        title: String(day.title || `Dia ${dayNumber}`).trim(),
        description: String(day.description || '').trim(),
        items: normalizedItems,
      };
    });
  }

  private inferDuration(category: ItineraryCategory, period?: string): number {
    switch (category) {
      case ItineraryCategory.CAFE:
        return 45;
      case ItineraryCategory.RESTAURANT:
        return 90;
      case ItineraryCategory.MUSEUM:
      case ItineraryCategory.TOURIST_ATTRACTION:
        return 120;
      case ItineraryCategory.TRANSPORT:
        return 150;
      case ItineraryCategory.BAR:
      case ItineraryCategory.NIGHTLIFE:
        return 90;
      case ItineraryCategory.PARK:
        return 75;
      default:
        return 60;
    }
  }

  // ==========================================
  // PROMPTS
  // ==========================================

  private getSystemPrompt(): string {
    return `Você é o Especialista Chefe em Roteiros e Curador de Viagens da 2GO.
Sua missão é criar roteiros de viagem personalizados, cronologicamente precisos, harmoniosos e altamente acionáveis para qualquer destino do mundo, integrando prioritariamente o acervo curado da biblioteca 2GO com a inteligência do modelo.

DIRETRIZES DE ESTRUTURA DIÁRIA (GRADE HORA A HORA ATÉ O JANTAR — OBRIGATÓRIO):
Organize cada dia com uma programação contínua, rica e sequencial da manhã até a noite:
1. CAFÉ DA MANHÃ (início da janela, ex: 08:30 - 09:30): Parada matinal para café/refeição em cafeteria ou bistrô local autêntico (priorize indicação da biblioteca 2GO se couber na faixa/horário, ou sugestão local autêntica da IA).
2. BLOCO DA MANHÃ: Pelo menos 3 atrações ou atividades culturais/históricas/passeios marcantes (priorize fortemente a biblioteca 2GO).
3. ALMOÇO (meio do dia, ex: 12:45 - 14:15): Restaurante para almoço em horário apropriado, alinhado à gastronomia local e ao orçamento do viajante (priorize restaurante da biblioteca 2GO).
4. BLOCO DA TARDE: Pelo menos 2 atrações ou experiências à tarde (priorize a biblioteca 2GO).
5. JANTAR (OBRIGATÓRIO, ex: 20:00 - 21:45): Restaurante para jantar memorável (o dia NÃO acaba à tarde; deve ir continuamente até a noite com um jantar bem indicado).

INTEGRAÇÃO COM A BIBLIOTECA 2GO (PRIORIDADE ABSOLUTA):
- Quando houver atrações e restaurantes cadastrados na biblioteca 2GO informados no contexto, você DEVE priorizá-los e incluí-los no roteiro.
- Para itens da biblioteca 2GO: preserve o nome e o endereço exatos, e defina sourceType: "BASE_TRIP" e sourceId: "[id da biblioteca]".
- Para itens adicionais sugeridos pela IA: complete a ordem, transfers e o que faltar com seu conhecimento especialista, definindo sourceType: "AI", sourceId: null, providerPlaceId: null.
- ZERO PLACE ID SINTÉTICO: providerPlaceId deve ser nulo se não veio especificado na biblioteca 2GO. NUNCA invente Place IDs fictícios!

REGRAS DE CONTEÚDO PARA CADA ATIVIDADE:
- title: Nome específico, autêntico e real do local ou experiência (NUNCA genérico como "Visitar um museu" ou "Almoço em restaurante local").
- category: Exclusivamente um dos ENUMs: TOURIST_ATTRACTION, MUSEUM, RESTAURANT, CAFE, BAR, BEACH, PARK, SHOPPING, EXPERIENCE, TRANSPORT, EVENT, NIGHTLIFE, FREE_ACTIVITY, PAID_ACTIVITY.
- timeLabel: Faixa horária sequencial e realista (ex: "09:00 - 10:30", "12:30 - 14:00"). Respeite a janela diária informada.
- duration: Duração em minutos inteiros (ex: 45, 60, 90, 120).
- period: "Manhã", "Almoço", "Tarde", "Pausa", "Jantar" ou "Noite".
- location: Endereço completo, bairro ou referência geográfica verificável no destino.
- description: Detalhamento prático do que fazer e experimentar + justificativa personalizada para o viajante.
- cost: Custo estimado por pessoa em moeda local (número decimal, 0 para gratuitas).
- currency: Código ISO da moeda local oficial do destino (ex: BRL no Brasil, USD nos EUA, EUR na Europa, JPY no Japão, etc.). NUNCA assuma EUR ou BRL se o destino for de outro país!
- notes: Texto estruturado com Deslocamento, Reserva/Ingresso, Dica útil e Alternativa.

IMPORTANTE:
- Não crie horários sobrepostos.
- Adapte o primeiro dia conforme horário real de chegada e o último dia conforme partida.
- Retorne EXATAMENTE no seguinte formato JSON, sem nenhum texto fora das chaves:
{
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "destination": "Nome da Cidade / Região",
      "title": "Título expressivo e elegante do dia",
      "description": "Resumo executivo do dia: foco temático, logística e objetivo principal.",
      "items": [
        {
          "title": "Nome Exato do Local ou Experiência",
          "category": "CAFE",
          "timeLabel": "08:30 - 09:30",
          "duration": 60,
          "period": "Manhã",
          "location": "Rua / Bairro / Cidade",
          "description": "Descrição detalhada do que fazer e justificativa personalizada para o viajante.",
          "cost": 10.0,
          "currency": "MOEDA_LOCAL_ISO",
          "notes": "Deslocamento: caminhada curta do hotel. Reserva: Acesso livre.",
          "sourceType": "BASE_TRIP",
          "sourceId": "id-se-da-biblioteca-ou-null",
          "providerPlaceId": null
        }
      ]
    }
  ]
}`;
  }

  private getGuestSystemPrompt(): string {
    return this.getSystemPrompt();
  }

  private buildPrompt(input: GenerateItineraryInput): string {
    const { destination, numberOfDays, travelProfile, baseTrip } = input;
    const localCurrency = inferCurrency(destination);

    let prompt = `Crie um roteiro completo de ${numberOfDays} dias para ${destination}.\n`;
    prompt += localCurrency
      ? `Moeda local oficial para estimativas: ${localCurrency}.\n\n`
      : `Moeda local para estimativas: identifique e utilize a moeda oficial (código ISO) do destino/país informado.\n\n`;

    if (travelProfile) {
      prompt += `### Perfil do Usuário e Preferências:\n`;
      prompt += `- Estilos de viagem: ${travelProfile.preferredStyles?.join(', ') || travelProfile.travelStyle || 'Confortável'}\n`;
      prompt += `- Companhia: ${travelProfile.travelCompanions?.join(', ') || 'Adultos'}\n`;
      prompt += `- Orçamento: ${travelProfile.budgetLevel || 'Médio'}\n`;
      prompt += `- Clima preferido: ${travelProfile.preferredClimate?.join(', ') || 'Qualquer'}\n`;
      prompt += `- Ritmo: ${travelProfile.prefersRelaxing ? 'Mais relaxante e sem pressa' : 'Mais ativo e dinâmico'}\n`;
      if (travelProfile.tripPreferences?.interests || travelProfile.interests) {
        prompt += `- Interesses prioritários: ${(travelProfile.tripPreferences?.interests || travelProfile.interests)?.join(', ')}\n`;
      }
      if (travelProfile.tripPreferences?.activityHours) {
        prompt += `- Janela diária de atividades: das ${travelProfile.tripPreferences.activityHours.startTime || '09:00'} às ${travelProfile.tripPreferences.activityHours.endTime || '18:30'}\n`;
      }
      if (travelProfile.editorialBrief) {
        prompt += `- Briefing editorial: ${travelProfile.editorialBrief}\n`;
      }
      prompt += `\n`;
    }

    if (baseTrip) {
      prompt += `### Referência Curada Base (BaseTrip):\n`;
      prompt += `Use as seguintes atrações e restaurantes como inspiração principal recomendada:\n`;
      prompt += JSON.stringify(baseTrip, null, 2);
      prompt += `\n\n`;
    }

    prompt += `Retorne exatamente ${numberOfDays} dias consecutivos com a programação detalhada solicitada, adaptada ao ritmo e janela de horários, sem sobreposição horária.`;

    return prompt;
  }

  private buildChunkPrompt(
    input: GenerateItineraryInput,
    chunk: {
      startDay: number;
      endDay: number;
      city: string;
      isFirst: boolean;
      isLast: boolean;
      previousCity?: string;
    },
  ): string {
    const { destination, numberOfDays, travelProfile } = input;
    const localCurrency = inferCurrency(chunk.city || destination);
    const expectedDaysCount = chunk.endDay - chunk.startDay + 1;

    let prompt = `ESTE É O PLANEJAMENTO DA ETAPA: DIAS ${chunk.startDay} A ${chunk.endDay} (Total do roteiro: ${numberOfDays} dias).\n`;
    prompt += `Destino principal do roteiro: ${destination}.\n`;
    prompt += `Cidade desta etapa: ${chunk.city || destination}.\n`;
    prompt += localCurrency
      ? `Moeda local oficial desta etapa: ${localCurrency}.\n\n`
      : `Moeda local para estimativas: identifique a moeda oficial (código ISO) de ${chunk.city || destination}.\n\n`;

    if (travelProfile) {
      prompt += `### Perfil do Viajante:\n`;
      prompt += `- Estilo: ${travelProfile.travelStyle || travelProfile.preferredStyles?.join(', ') || 'Confortável'}\n`;
      prompt += `- Orçamento: ${travelProfile.budgetLevel || 'Médio'}\n`;
      prompt += `- Interesses: ${(travelProfile.interests || travelProfile.tripPreferences?.interests)?.join(', ') || 'Cultura, Gastronomia, História'}\n`;
      if (travelProfile.tripPreferences?.activityHours) {
        prompt += `- Janela diária: ${travelProfile.tripPreferences.activityHours.startTime || '09:00'} às ${travelProfile.tripPreferences.activityHours.endTime || '18:30'}\n`;
      }
      prompt += `\n`;
    }

    if (chunk.isFirst) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.startDay} (Chegada): O viajante desembarca no destino. Inclua transfer/aeroporto, check-in no hotel, caminhada leve de aclimatação e jantar de boas-vindas.\n`;
    } else if (chunk.previousCity) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.startDay} (Transferência de Cidade): O dia inicia com o deslocamento saindo de ${chunk.previousCity} com destino a ${chunk.city}. Inclua a atividade de transporte (ex: trem, voo ou transfer), tempo de estação/aeroporto, check-in no novo hotel e programação da tarde/noite já na nova cidade.\n`;
    }

    if (chunk.isLast) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.endDay} (Despedida): Dia de encerramento da viagem. Inclua últimas compras ou café especial, check-out do hotel e transfer para o aeroporto/estação de partida.\n`;
    }

    const currencyInstruction = localCurrency ? `cost em ${localCurrency}, currency="${localCurrency}"` : `cost em moeda local, currency no código ISO oficial do destino`;

    prompt += `\nCOMANDO:
Gere EXATAMENTE ${expectedDaysCount} dias no JSON: começando no dayNumber ${chunk.startDay} até o dayNumber ${chunk.endDay}.
Cada dia deve conter uma programação completa, sequencial e harmoniosa: refeições bem posicionadas (café da manhã, almoço, jantar) e atividades/atrações culturais, gastronômicas ou de lazer que respeitem a janela de atividades e os interesses do viajante, sem sobreposição horária.
Todos com timeLabel sequencial, duration em minutos, ${currencyInstruction}, e notes detalhadas com deslocamento, regras de reserva e alternativas.`;

    return prompt;
  }

  private buildGuestPrompt(input: GenerateGuestItineraryInput): string {
    const {
      destinations,
      travelers,
      interests,
      activityHours,
      budgetLevel,
      travelStyle,
      curatedContext,
    } = input;

    const primaryDest = destinations[0]?.name || 'Destino';
    const localCurrency = inferCurrency(primaryDest);

    let prompt = `Crie um roteiro completo e hiperdetalhado para os seguintes destinos:\n\n`;

    prompt += `### Destinos e Cronograma:\n`;
    destinations.forEach((d, idx) => {
      prompt += `${idx + 1}. ${d.name}\n`;
      if (d.arrivalDate)
        prompt += `   - Chegada: ${d.arrivalDate}${d.arrivalTime ? ` às ${d.arrivalTime}` : ''}\n`;
      if (d.departureDate)
        prompt += `   - Partida: ${d.departureDate}${d.departureTime ? ` às ${d.departureTime}` : ''}\n`;
    });

    prompt += `\n### Viajantes:\n`;
    const parts: string[] = [];
    if (travelers.adults > 0) parts.push(`${travelers.adults} adulto(s)`);
    if (travelers.children > 0) parts.push(`${travelers.children} criança(s)`);
    if (travelers.elders > 0) parts.push(`${travelers.elders} idoso(s)`);
    prompt += `- Composição: ${parts.join(', ') || '1 adulto'}\n`;

    if (interests && interests.length > 0) {
      prompt += `- Interesses prioritários: ${interests.join(', ')}\n`;
    }

    if (activityHours && (activityHours.startTime || activityHours.endTime)) {
      prompt += `- Janela diária preferida de atividades: das ${activityHours.startTime || '09:00'} às ${activityHours.endTime || '18:30'}\n`;
    }

    if (budgetLevel) {
      prompt += `- Nível de orçamento: ${budgetLevel}\n`;
    }

    if (travelStyle) {
      prompt += `- Estilo de viagem: ${travelStyle}\n`;
    }

    prompt += localCurrency
      ? `- Moeda local para estimativas: ${localCurrency}\n\n`
      : `- Moeda local para estimativas: identifique a moeda oficial (código ISO) de cada destino informado.\n\n`;

    if (curatedContext && curatedContext.destinations) {
      prompt += `### BIBLIOTECA DE CURADORIA 2GO (INDICAÇÕES PRÓPRIAS E SESSÃO ESCRITA):\n`;
      for (const destCtx of curatedContext.destinations) {
        prompt += `\nDestino: ${destCtx.destinationName} (Cobertura: ${destCtx.coverage})\n`;
        if (destCtx.bestBaseTrip) {
          const bt = destCtx.bestBaseTrip.baseTrip;
          prompt += `[Roteiro Base / Sessão Escrita 2GO - ID: ${bt.id}] ${bt.title}\n`;
          if (bt.shortDescription) prompt += `Resumo: ${bt.shortDescription}\n`;
          if (bt.fullDescription) prompt += `Sessão Escrita do Destino / Guia: ${bt.fullDescription}\n`;
        }
        if (destCtx.attractions?.length) {
          prompt += `\n[Indicações 2GO - Pontos Turísticos / Atrações da Biblioteca]:\n`;
          destCtx.attractions.forEach((a) => {
            const attr = a.attraction;
            prompt += `- ${attr.name} (ID: ${attr.id}) | Endereço: ${attr.address || 'N/A'} | Categoria: ${attr.category || 'Atração'} | Ingresso: ${attr.requiresTicket ? 'Sim' : 'Não'}${attr.providerPlaceId ? ` | PlaceID: ${attr.providerPlaceId}` : ''}\n`;
          });
        }
        if (destCtx.restaurants?.length) {
          prompt += `\n[Indicações 2GO - Restaurantes / Gastronomia da Biblioteca]:\n`;
          destCtx.restaurants.forEach((r) => {
            const rest = r.restaurant;
            prompt += `- ${rest.name} (ID: ${rest.id}) | Endereço: ${rest.address || 'N/A'} | Cozinha: ${rest.cuisineType || 'Local'} | Faixa: ${rest.priceRange || rest.priceLevel || 'Média'}${rest.recommendedDish ? ` | Especialidade: ${rest.recommendedDish}` : ''}${rest.providerPlaceId ? ` | PlaceID: ${rest.providerPlaceId}` : ''}\n`;
          });
        }
        if (destCtx.knowledgeArticles?.length) {
          prompt += `\n[Artigos de Conhecimento 2GO / Dicas do Destino]:\n`;
          destCtx.knowledgeArticles.forEach((ka: any) => {
            prompt += `- Artigo: ${ka.title} (${ka.category}): ${ka.summary || ka.content?.slice(0, 300)}\n`;
          });
        }
      }
      prompt += `\n`;
    }

    prompt += `\nCOMANDOS OBRIGATÓRIOS PARA CADA DIA:
1. Monte uma grade cronológica contínua HORA A HORA até o jantar (café da manhã, ≥3 atrações de manhã, almoço, ≥2 atrações de tarde e jantar obrigatório). O dia NÃO termina à tarde!
2. Incorpore prioritariamente as atrações e restaurantes acima da Biblioteca 2GO (com seus nomes e endereços exatos).
3. Para itens da Biblioteca 2GO, defina sourceType="BASE_TRIP" e sourceId="[id da biblioteca]". Para novos itens sugeridos pela IA, defina sourceType="AI", sourceId=null, providerPlaceId=null (SEM Place IDs inventados).
4. Retorne a resposta exclusivamente no JSON estruturado com horários sequenciais realistas.`;

    return prompt;
  }

  private buildGuestChunkPrompt(
    input: GenerateGuestItineraryInput,
    chunk: {
      startDay: number;
      endDay: number;
      city: string;
      isFirst: boolean;
      isLast: boolean;
      previousCity?: string;
    },
    totalDays: number,
  ): string {
    const { travelers, interests, activityHours, budgetLevel, travelStyle } = input;
    const localCurrency = inferCurrency(chunk.city);
    const expectedDaysCount = chunk.endDay - chunk.startDay + 1;

    let prompt = `ESTE É O PLANEJAMENTO DA ETAPA: DIAS ${chunk.startDay} A ${chunk.endDay} (Total do roteiro: ${totalDays} dias).\n`;
    prompt += `Cidade desta etapa: ${chunk.city}.\n`;
    prompt += localCurrency
      ? `Moeda local oficial desta etapa: ${localCurrency}.\n\n`
      : `Moeda local para estimativas: identifique a moeda oficial (código ISO) de ${chunk.city}.\n\n`;

    prompt += `### Perfil dos Viajantes:\n`;
    prompt += `- Composição: ${travelers.adults} adulto(s), ${travelers.children || 0} criança(s), ${travelers.elders || 0} idoso(s)\n`;
    prompt += `- Interesses: ${interests?.join(', ') || 'Cultura, Gastronomia, História'}\n`;
    prompt += `- Orçamento: ${budgetLevel || 'Médio'}\n`;
    prompt += `- Estilo: ${travelStyle || 'Confortável'}\n`;
    if (activityHours?.startTime || activityHours?.endTime) {
      prompt += `- Janela de atividades: ${activityHours.startTime || '09:00'} às ${activityHours.endTime || '18:30'}\n`;
    }
    prompt += `\n`;

    if (input.curatedContext && input.curatedContext.destinations) {
      const destCtx = input.curatedContext.destinations.find(
        (d) =>
          d.destinationName?.toLowerCase().includes(chunk.city.toLowerCase()) ||
          chunk.city.toLowerCase().includes(d.destinationName?.toLowerCase() || ''),
      );
      if (destCtx) {
        if (destCtx.bestBaseTrip) {
          const bt = destCtx.bestBaseTrip.baseTrip;
          prompt += `### Base Curada 2GO para ${chunk.city} (ID: ${bt.id}): ${bt.title}\n`;
          if (bt.shortDescription) prompt += `Resumo: ${bt.shortDescription}\n`;
          if (bt.fullDescription) prompt += `Sessão Escrita: ${bt.fullDescription}\n`;
        }
        if (destCtx.attractions?.length) {
          prompt += `Atrações Recomendadas da Biblioteca 2GO:\n`;
          destCtx.attractions.slice(0, 8).forEach((a) => {
            prompt += `- ${a.attraction.name} (ID: ${a.attraction.id}) | Endereço: ${a.attraction.address || 'N/A'} | Categoria: ${a.attraction.category}\n`;
          });
        }
        if (destCtx.restaurants?.length) {
          prompt += `Restaurantes Recomendados da Biblioteca 2GO:\n`;
          destCtx.restaurants.slice(0, 5).forEach((r) => {
            prompt += `- ${r.restaurant.name} (ID: ${r.restaurant.id}) | Endereço: ${r.restaurant.address || 'N/A'} | Cozinha: ${r.restaurant.cuisineType || 'Local'}\n`;
          });
        }
        if (destCtx.knowledgeArticles?.length) {
          prompt += `Dicas e Artigos de Conhecimento 2GO:\n`;
          destCtx.knowledgeArticles.forEach((ka: any) => {
            prompt += `- ${ka.title}: ${ka.summary || ka.content?.slice(0, 200)}\n`;
          });
        }
        prompt += `\n`;
      }
    }

    if (chunk.isFirst) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.startDay} (Chegada): Primeiro dia no destino. Inclua transfer de chegada, check-in no hotel, caminhada de aclimatação e jantar de boas-vindas.\n`;
    } else if (chunk.previousCity) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.startDay} (Transferência): Viagem saindo de ${chunk.previousCity} com destino a ${chunk.city}. Inclua a atividade de transporte (trem, voo ou transfer), tempo de estação/aeroporto, check-in no hotel e programação da tarde/noite já em ${chunk.city}.\n`;
    }

    if (chunk.isLast) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.endDay} (Despedida): Dia de encerramento da viagem. Inclua últimas compras ou café especial, check-out do hotel e transfer para o aeroporto de partida.\n`;
    }

    const currencyInstruction = localCurrency ? `cost em ${localCurrency}, currency="${localCurrency}"` : `cost em moeda local, currency no código ISO oficial do destino`;

    prompt += `\nCOMANDO:
Gere EXATAMENTE ${expectedDaysCount} dias no JSON: começando no dayNumber ${chunk.startDay} até o dayNumber ${chunk.endDay}.
Cada dia deve cobrir uma grade contínua HORA A HORA até o jantar (café da manhã, ≥3 atrações manhã, almoço, ≥2 atrações tarde e jantar obrigatório). O dia NÃO pode acabar à tarde!
Priorize fortemente as atrações e restaurantes da Biblioteca 2GO (marcando sourceType="BASE_TRIP" e sourceId="[id]").
Sem Place IDs sintéticos (providerPlaceId deve ser nulo se não veio da biblioteca).
Todos os itens com timeLabel sequencial, duration em minutos, ${currencyInstruction} e notes práticas.`;

    return prompt;
  }
}
