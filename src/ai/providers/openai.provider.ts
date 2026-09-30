import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  AIProvider,
  GenerateItineraryInput,
  GenerateGuestItineraryInput,
  AIProviderResult,
} from './ai-provider.interface';
import { ItineraryCategory } from '@prisma/client';
import OpenAI from 'openai';

export function inferCurrency(destinationName?: string): string {
  const norm = (destinationName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/japao|japan|toquio|tokyo|quioto|kyoto|osaka|hiroshima|nara|hokkaido|fukuoka/.test(norm)) return 'JPY';
  if (/coreia|korea|seul|seoul|busan/.test(norm)) return 'KRW';
  if (/tailandia|thailand|bangkok|bangcoc|phuket|chiang mai|krabi/.test(norm)) return 'THB';
  if (
    /italia|italy|roma|rome|milao|milan|florenca|florence|veneza|venice|napoles|franca|france|paris|espanha|spain|madrid|barcelona|portugal|lisboa|porto|alemanha|germany|berlim|grecia|greece|atenas|holanda|amsterdam|austria|viena/.test(
      norm,
    )
  )
    return 'EUR';
  if (/reino unido|united kingdom|londres|london|inglaterra|england|escocia|scotland/.test(norm)) return 'GBP';
  if (/estados unidos|usa|united states|nova york|new york|miami|orlando|los angeles|san francisco/.test(norm)) return 'USD';
  if (/brasil|brazil|rio de janeiro|sao paulo|salvador|florianopolis|fortaleza/.test(norm)) return 'BRL';
  return 'EUR';
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
      `Iniciando geração de roteiro longo (${numberOfDays} dias) em ${chunks.length} etapas paralelas para máxima performance e qualidade.`,
    );

    let totalTokens = 0;

    const chunkResults = await Promise.all(
      chunks.map(async (chunk) => {
        this.logger.log(
          `Disparando etapa: Dias ${chunk.startDay} a ${chunk.endDay} (${chunk.city || destination})...`,
        );

        const chunkPrompt = this.buildChunkPrompt(input, chunk);
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
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
              if (!d.destination) d.destination = chunk.city || destination;
              processedDays.push(d);
            });

            this.logger.log(
              `Etapa Dias ${chunk.startDay} a ${chunk.endDay} (${chunk.city || destination}) concluída com sucesso!`,
            );
            return processedDays;
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
        return [];
      }),
    );

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
    const primaryDest = input.destinations?.[0]?.name || 'Ásia';

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
        const itemCurrency = item.currency || localCurrency;

        let timeLabel = item.timeLabel;
        if (!timeLabel || typeof timeLabel !== 'string' || !timeLabel.trim()) {
          timeLabel = this.synthesizeTimeLabel(itemIdx, item.period, item.duration);
        }

        const duration = Number.isFinite(Number(item.duration))
          ? Number(item.duration)
          : this.inferDuration(category, item.period);

        return {
          title: String(item.title || 'Experiência').trim(),
          category,
          timeLabel: String(timeLabel).trim(),
          duration,
          period: String(item.period || 'Manhã').trim(),
          location: String(item.location || dayDest).trim(),
          description: String(item.description || '').trim(),
          cost: validCost,
          currency: String(itemCurrency).toUpperCase().trim(),
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

  private synthesizeTimeLabel(idx: number, period?: string, duration?: number): string {
    const slots = [
      '08:30 - 09:15', // Café
      '09:30 - 12:00', // Manhã
      '12:15 - 13:45', // Almoço
      '14:15 - 15:00', // Pausa / Café da tarde
      '15:15 - 17:30', // Tarde
      '19:30 - 21:30', // Jantar
      '21:45 - 23:00', // Noite
    ];
    if (idx < slots.length) return slots[idx];
    const hour = 18 + (idx - 5);
    return `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1).toString().padStart(2, '0')}:30`;
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
Sua missão é criar roteiros de viagem premium, hiperdetalhados, cronologicamente precisos e altamente acionáveis.

DIRETRIZES DE ESTRUTURA OBRIGATÓRIAS POR DIA:
Para cada dia completo, construa uma programação cronológica sequencial, rica e sem sobreposição de horários:
1. Café da Manhã (category: "CAFE"): Cafeteria, confeitaria artesanal ou padaria histórica autêntica da cidade, indicando a especialidade matinal local. Duração típica: 45 min.
2. Manhã - Atração / Experiência Principal (category: "TOURIST_ATTRACTION" ou "MUSEUM"): Visita cultural, histórica ou marco emblemático. Agrupe pontos geograficamente próximos. Duração típica: 1h30 a 2h30.
3. Almoço (category: "RESTAURANT"): Trattoria, bistrô, mercado gastronômico ou restaurante típico com prato tradicional recomendado, coerente com o orçamento. Duração típica: 1h15 a 1h30.
4. Pausa / Café da Tarde (category: "CAFE" ou "EXPERIENCE"): Parada para descanso com café especial, casa de chá tradicional ou sobremesa artesanal (gelato, confeitaria, matcha). Duração típica: 30 a 45 min.
5. Tarde - Passeio Cultural ou Cênico (category: "TOURIST_ATTRACTION", "PARK" ou "SHOPPING"): Bairro charmoso, mirante, praça histórica, parque ou caminhada contemplativa. Duração típica: 1h30 a 2h30.
6. Jantar (category: "RESTAURANT"): Restaurante selecionado para a noite com culinária autêntica regional e ambiente acolhedor. Duração típica: 1h30 a 2h.
7. Noite (Opcional/Complementar) (category: "BAR", "NIGHTLIFE" ou "FREE_ACTIVITY"): Passeio noturno por marcos iluminados, rooftop com vista panorâmica ou bar icônico. Duração típica: 1h a 1h30.
8. Transferências entre Cidades / Deslocamentos Longos (category: "TRANSPORT"): Quando houver troca de cidade ou país (ex: Shinkansen, voo regional, trem), inclua o transporte com orientações de estação/aeroporto, check-in e acomodação de bagagens.

REGRAS DE CONTEÚDO PARA CADA ATIVIDADE:
- title: Nome específico, autêntico e real do local ou experiência (NUNCA genérico como "Visitar um museu" ou "Almoço em restaurante local").
- category: Exclusivamente um dos ENUMs: TOURIST_ATTRACTION, MUSEUM, RESTAURANT, CAFE, BAR, BEACH, PARK, SHOPPING, EXPERIENCE, TRANSPORT, EVENT, NIGHTLIFE, FREE_ACTIVITY, PAID_ACTIVITY.
- timeLabel: Faixa horária sequencial e realista (ex: "08:30 - 09:15", "09:30 - 12:00", "12:15 - 13:45", "14:15 - 15:00", "15:15 - 17:30", "19:30 - 21:30"). Respeite a janela diária informada.
- duration: Duração em minutos inteiros (ex: 45, 120, 90, 45, 135, 120).
- period: "Manhã", "Almoço", "Tarde", "Pausa", "Jantar" ou "Noite".
- location: Endereço, bairro ou referência geográfica verificável no destino.
- description: Detalhamento prático do que fazer e experimentar + JUSTIFICATIVA explícita de por que essa atividade foi escolhida para o perfil do viajante (interesses, estilo, ritmo, orçamento).
- cost: Custo estimado por pessoa em moeda local (número decimal, ex: 18.0 para ingresso, 25.0 para almoço, 4.0 para café, 0 para atrações gratuitas).
- currency: Código ISO da moeda local oficial do destino (EUR na Itália/França, JPY no Japão, KRW na Coreia do Sul, THB na Tailândia, USD nos EUA, GBP no Reino Unido, BRL no Brasil). NUNCA assuma BRL fora do Brasil!
- notes: Texto estruturado contendo:
  * Deslocamento: tempo e meio de transporte a partir da parada anterior (ex: "Caminhada de 8 min pela Via dei Fori Imperiali" ou "Metrô Linha Ginza: 12 min").
  * Reserva / Ingresso: orientação prática (ex: "Ingresso online com horário marcado obrigatório", "Reserva recomendada com antecedência", ou "Entrada livre").
  * Dica útil de visitação (melhor mesa, mirante secreto, traje adequado).
  * Alternativa para mau tempo ou fechamento (ex: "Em caso de chuva, visite a Galeria X").
  * Aviso: "Valores e horários são estimativas que devem ser confirmadas pelo viajante antes da visita."

IMPORTANTE:
- Não crie horários sobrepostos.
- Adapte o primeiro dia se houver chegada à tarde/noite (apenas check-in, caminhada de aclimatação e jantar).
- Adapte o último dia para transfer e despedida.
- Não invente confirmações de reservas reais ou vouchers definitivos; sempre oriente como recomendação curada.
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
          "timeLabel": "08:30 - 09:15",
          "duration": 45,
          "period": "Manhã",
          "location": "Rua / Bairro / Cidade",
          "description": "Descrição detalhada do que fazer e justificativa personalizada para o viajante.",
          "cost": 5.0,
          "currency": "EUR",
          "notes": "Deslocamento: 5 min a pé do hotel. Reserva: Acesso livre. Dica: Peça no balcão. Alternativa em caso de chuva: Café histórico coberto. Valores e horários são estimativas.",
          "sourceType": "AI",
          "sourceId": null,
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
    prompt += `Moeda local obrigatória para estimativas: ${localCurrency}.\n\n`;

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

    prompt += `Retorne exatamente ${numberOfDays} dias consecutivos com a programação detalhada solicitada (café da manhã, passeios da manhã, almoço, pausa/café da tarde, passeios da tarde, jantar e noite).`;

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
    prompt += `Moeda local oficial desta etapa: ${localCurrency}.\n\n`;

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
      prompt += `ORIENTAÇÃO DO DIA ${chunk.startDay} (Transferência de Cidade): O dia inicia com o deslocamento saindo de ${chunk.previousCity} com destino a ${chunk.city}. Inclua a atividade de transporte (ex: trem de alta velocidade, voo ou transfer), tempo de estação/aeroporto, check-in no novo hotel e programação da tarde/noite já na nova cidade.\n`;
    }

    if (chunk.isLast) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.endDay} (Despedida): Dia de encerramento da viagem. Inclua últimas compras ou café especial, check-out do hotel e transfer para o aeroporto/estação de partida.\n`;
    }

    prompt += `\nCOMANDO ESTRITO:
Gere EXATAMENTE ${expectedDaysCount} dias no JSON: começando no dayNumber ${chunk.startDay} até o dayNumber ${chunk.endDay}.
Para CADA dia, forneça a programação completa:
1. Café da Manhã (CAFE)
2. Passeio da Manhã (TOURIST_ATTRACTION ou MUSEUM)
3. Almoço (RESTAURANT)
4. Pausa da Tarde (CAFE ou EXPERIENCE)
5. Passeio da Tarde (TOURIST_ATTRACTION ou PARK)
6. Jantar (RESTAURANT)
7. Programa Noturno (BAR, NIGHTLIFE ou FREE_ACTIVITY)

Todos com timeLabel sem sobreposição, duration em minutos, cost em ${localCurrency}, currency="${localCurrency}", e notes detalhadas com deslocamento, regras de reserva e alternativas.`;

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

    prompt += `- Moeda local para estimativas: ${localCurrency}\n\n`;

    if (curatedContext && curatedContext.destinations) {
      prompt += `### Conhecimento Curado 2GO por Destino:\n`;
      for (const destCtx of curatedContext.destinations) {
        prompt += `\nDestino: ${destCtx.destinationName} (Cobertura: ${destCtx.coverage})\n`;
        if (destCtx.bestBaseTrip) {
          const bt = destCtx.bestBaseTrip.baseTrip;
          prompt += `[BaseTrip Curada - ID: ${bt.id}] ${bt.title}\n`;
          if (destCtx.attractions?.length) {
            prompt += `Atrações Recomendadas:\n`;
            destCtx.attractions.forEach((a) => {
              prompt += `- ${a.attraction.name} (PlaceID: ${a.attraction.providerPlaceId || 'N/A'})\n`;
            });
          }
          if (destCtx.restaurants?.length) {
            prompt += `Restaurantes Recomendados:\n`;
            destCtx.restaurants.forEach((r) => {
              prompt += `- ${r.restaurant.name} (Prato: ${r.restaurant.recommendedDish || 'Especialidade local'})\n`;
            });
          }
        }
      }
      prompt += `\n`;
    }

    prompt += `Retorne a programação diária completa estruturada em JSON (café da manhã, passeios da manhã, almoço, pausa da tarde, passeios da tarde, jantar e noite), com horários realistas, custos em moeda local e notas de deslocamento e reserva.`;

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
    prompt += `Moeda local oficial desta etapa: ${localCurrency}.\n\n`;

    prompt += `### Perfil dos Viajantes:\n`;
    prompt += `- Composição: ${travelers.adults} adulto(s), ${travelers.children || 0} criança(s), ${travelers.elders || 0} idoso(s)\n`;
    prompt += `- Interesses: ${interests?.join(', ') || 'Cultura, Gastronomia, História'}\n`;
    prompt += `- Orçamento: ${budgetLevel || 'Médio'}\n`;
    prompt += `- Estilo: ${travelStyle || 'Confortável'}\n`;
    if (activityHours?.startTime || activityHours?.endTime) {
      prompt += `- Janela de atividades: ${activityHours.startTime || '09:00'} às ${activityHours.endTime || '18:30'}\n`;
    }
    prompt += `\n`;

    if (chunk.isFirst) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.startDay} (Chegada): Primeiro dia no destino. Inclua transfer de chegada, check-in no hotel, caminhada de aclimatação e jantar de boas-vindas.\n`;
    } else if (chunk.previousCity) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.startDay} (Transferência): Viagem saindo de ${chunk.previousCity} com destino a ${chunk.city}. Inclua a atividade de transporte (trem-bala, voo ou transfer), tempo de estação/aeroporto, check-in no hotel e programação da tarde/noite já em ${chunk.city}.\n`;
    }

    if (chunk.isLast) {
      prompt += `ORIENTAÇÃO DO DIA ${chunk.endDay} (Despedida): Dia de encerramento da viagem. Inclua últimas compras ou café especial, check-out do hotel e transfer para o aeroporto de partida.\n`;
    }

    prompt += `\nCOMANDO ESTRITO:
Gere EXATAMENTE ${expectedDaysCount} dias no JSON: começando no dayNumber ${chunk.startDay} até o dayNumber ${chunk.endDay}.
Cada dia deve conter a programação rica e sequencial: café da manhã (CAFE), atração da manhã (TOURIST_ATTRACTION/MUSEUM), almoço (RESTAURANT), pausa/café da tarde (CAFE/EXPERIENCE), atração da tarde (TOURIST_ATTRACTION/PARK), jantar (RESTAURANT) e noite (BAR/NIGHTLIFE).
Todos com timeLabel sequencial, duration em minutos, cost em ${localCurrency}, currency="${localCurrency}" e notes práticas.`;

    return prompt;
  }
}
