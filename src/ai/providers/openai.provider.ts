import { Injectable, Logger } from '@nestjs/common';
import { AIProvider, GenerateItineraryInput } from './ai-provider.interface';
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

  async generateItinerary(input: GenerateItineraryInput) {
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
}
