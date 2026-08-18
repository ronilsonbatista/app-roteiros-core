import { Injectable, Logger } from '@nestjs/common';
import {
  AIProvider,
  GenerateItineraryInput,
  GenerateGuestItineraryInput,
  AIProviderResult,
} from './ai-provider.interface';
import OpenAI from 'openai';

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

  async generateItinerary(input: GenerateItineraryInput): Promise<AIProviderResult> {
    if (!this.openai) {
      throw new Error(
        'OpenAI API Key is not configured. Please set the OPENAI_API_KEY environment variable.',
      );
    }
    const prompt = this.buildPrompt(input);

    try {
      this.logger.log(`Calling OpenAI with model ${this.model}`);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this.getSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('A OpenAI retornou uma resposta vazia.');
      }
      const parsedData = JSON.parse(content);

      return {
        rawResponse: content,
        parsedData,
        tokensUsed: response.usage?.total_tokens || 0,
        model: this.model,
        provider: 'OPENAI',
      };
    } catch (error) {
      this.logger.error('OpenAI Generation failed', error);
      throw error;
    }
  }

  async generateGuestItinerary(input: GenerateGuestItineraryInput): Promise<AIProviderResult> {
    if (!this.openai) {
      throw new Error(
        'OpenAI API Key is not configured. Please set the OPENAI_API_KEY environment variable.',
      );
    }
    const prompt = this.buildGuestPrompt(input);

    try {
      this.logger.log(`Calling OpenAI for GuestJourney with model ${this.model}`);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this.getGuestSystemPrompt() },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('A OpenAI retornou uma resposta vazia.');
      }
      const parsedData = JSON.parse(content);

      return {
        rawResponse: content,
        parsedData,
        tokensUsed: response.usage?.total_tokens || 0,
        model: this.model,
        provider: 'OPENAI',
      };
    } catch (error) {
      this.logger.error('OpenAI Guest Generation failed', error);
      throw error;
    }
  }

  private getSystemPrompt(): string {
    return `Você é um especialista em viagens de alto padrão e roteiros detalhados.
Sua missão é criar um roteiro de viagem personalizado baseado nas preferências do usuário.
Você DEVE retornar a resposta EXATAMENTE no seguinte formato JSON, sem marcações markdown extra ou texto fora do JSON:
{
  "days": [
    {
      "dayNumber": 1,
      "title": "Dia 1: Chegada e exploração",
      "description": "Descrição do dia",
      "items": [
        {
          "title": "Nome do local",
          "description": "Por que visitar",
          "category": "TOURIST_ATTRACTION | RESTAURANT | MUSEUM ...",
          "location": "Endereço ou região",
          "period": "Manhã | Tarde | Noite",
          "estimatedCost": 0.0
        }
      ]
    }
  ]
}`;
  }

  private getGuestSystemPrompt(): string {
    return `Você é um especialista em viagens premium da plataforma 2GO.
Sua missão é criar um roteiro completo, hiper-personalizado e otimizado para o usuário anônimo em processo de planejamento.
Regras estritas:
1. Respeite rigorousamente as datas de chegada e partida de cada destino.
2. Respeite os horários de chegada no primeiro dia e partida no último dia (ex: se o voo chega às 19h, programe apenas jantar/noite no Dia 1).
3. Respeite a janela diária de atividades informada (ex: das 09:00 às 18:30).
4. As categorias dos itens devem ser exclusivamente um dos seguintes valores ENUM:
   TOURIST_ATTRACTION, MUSEUM, RESTAURANT, CAFE, BAR, BEACH, PARK, SHOPPING, EXPERIENCE, TRANSPORT, EVENT, NIGHTLIFE, FREE_ACTIVITY, PAID_ACTIVITY.
5. Retorne a resposta EXATAMENTE no seguinte formato JSON, sem texto fora do JSON:
{
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "destination": "Nome do Destino",
      "title": "Título descritivo do dia",
      "description": "Resumo do que será feito neste dia",
      "items": [
        {
          "title": "Nome da Atividade ou Local",
          "description": "Detalhamento e dica exclusiva de viagem",
          "category": "TOURIST_ATTRACTION",
          "location": "Endereço ou bairro",
          "period": "Manhã | Tarde | Noite",
          "estimatedCost": 0.0
        }
      ]
    }
  ]
}`;
  }

  private buildPrompt(input: GenerateItineraryInput): string {
    const { destination, numberOfDays, travelProfile, baseTrip } = input;

    let prompt = `Crie um roteiro de ${numberOfDays} dias para ${destination}.\n\n`;

    if (travelProfile) {
      prompt += `### Perfil do Usuário:\n`;
      prompt += `- Estilos preferidos: ${travelProfile.preferredStyles?.join(', ') || 'Geral'}\n`;
      prompt += `- Companhias: ${travelProfile.travelCompanions?.join(', ') || 'Não especificado'}\n`;
      prompt += `- Orçamento: ${travelProfile.budgetLevel || 'Médio'}\n`;
      prompt += `- Clima preferido: ${travelProfile.preferredClimate?.join(', ') || 'Qualquer'}\n`;
      prompt += `- Ritmo: ${travelProfile.prefersRelaxing ? 'Mais relaxante' : 'Mais ativo'}\n`;
      prompt += `- Restrições/Evitar: ${travelProfile.avoidedDestinations?.join(', ') || 'Nenhuma'}\n\n`;
    }

    if (baseTrip) {
      prompt += `### Referência Base (BaseTrip):\n`;
      prompt += `Use os dados a seguir como INSPIRAÇÃO principal, mas adapte para o perfil do usuário.\n`;
      prompt += `Não copie integralmente, mas garanta que os locais chaves desta referência sejam incluídos se fizerem sentido.\n`;
      prompt += JSON.stringify(baseTrip, null, 2);
    }

    return prompt;
  }

  private buildGuestPrompt(input: GenerateGuestItineraryInput): string {
    const { destinations, travelers, interests, activityHours, budgetLevel, travelStyle } = input;

    let prompt = `Crie um roteiro detalhado para os seguintes destinos e especificações:\n\n`;

    prompt += `### Destinos Sequenciais:\n`;
    destinations.forEach((d, idx) => {
      prompt += `${idx + 1}. ${d.name}\n`;
      if (d.arrivalDate) prompt += `   - Chegada: ${d.arrivalDate}${d.arrivalTime ? ` às ${d.arrivalTime}` : ''}\n`;
      if (d.departureDate) prompt += `   - Partida: ${d.departureDate}${d.departureTime ? ` às ${d.departureTime}` : ''}\n`;
    });

    prompt += `\n### Viajantes:\n`;
    const travelerParts: string[] = [];
    if (travelers.adults > 0) travelerParts.push(`${travelers.adults} adulto(s)`);
    if (travelers.children > 0) travelerParts.push(`${travelers.children} criança(s)`);
    if (travelers.elders > 0) travelerParts.push(`${travelers.elders} idoso(s)`);
    prompt += `- Composição: ${travelerParts.join(', ') || '1 adulto'}\n`;

    if (interests && interests.length > 0) {
      const interestLabels: Record<string, string> = {
        arte: 'Arte e Cultura',
        gastronomia: 'Gastronomia Local',
        natureza: 'Natureza e Ao Ar Livre',
        compras: 'Compras',
        historia: 'História e Patrimônio',
        praia: 'Praias e Litoral',
        vida_noturna: 'Vida Noturna e Bares',
        relaxamento: 'Bem-estar e Relaxamento',
        aventura: 'Esportes e Aventura',
        familia: 'Atividades em Família',
      };
      const formattedInterests = interests.map((i) => interestLabels[i] || i);
      prompt += `- Interesses prioritários: ${formattedInterests.join(', ')}\n`;
    }

    if (activityHours && (activityHours.startTime || activityHours.endTime)) {
      prompt += `- Janela diária preferida de atividades: das ${activityHours.startTime || '09:00'} às ${activityHours.endTime || '19:00'}\n`;
    }

    if (budgetLevel) {
      const budgetMap: Record<string, string> = {
        LOW: '$ Econômico',
        MEDIUM: '$$ Confortável',
        HIGH: '$$$ Premium',
        PREMIUM: '$$$$ Luxo / Alta Gastronomia',
      };
      prompt += `- Nível financeiro/orçamento: ${budgetMap[budgetLevel] || budgetLevel}\n`;
    }

    if (travelStyle) {
      prompt += `- Estilo de viagem: ${travelStyle}\n`;
    }

    return prompt;
  }
}

