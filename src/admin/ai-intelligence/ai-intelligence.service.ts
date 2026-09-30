import {
  Injectable,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdateGuidelineDto,
  CreateKnowledgeArticleDto,
  UpdateKnowledgeArticleDto,
  EditorialAssistDto,
  PlaygroundSimulateDto,
} from './dto/ai-intelligence.dto';
import OpenAI from 'openai';
import { inferCurrency } from '../../ai/providers/openai.provider';

@Injectable()
export class AiIntelligenceService {
  private readonly logger = new Logger(AiIntelligenceService.name);
  private openai: OpenAI | null = null;

  constructor(private readonly prisma: PrismaService) {
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      this.openai = new OpenAI({ apiKey: key });
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  // ==========================================
  // GUIDELINES (VOICE & TONE)
  // ==========================================

  async getGuidelines() {
    const defaults = [
      {
        key: 'TONE_OF_VOICE',
        name: 'Tom de Voz 2GO',
        description:
          'Diretriz geral de personalidade, elegância e proximidade da IA com o viajante',
        content:
          'Elegante, acolhedor, conhecedor e descomplicado. Evite clichês turísticos óbvios. Destaque dicas exclusivas e logística inteligente.',
      },
      {
        key: 'AVOIDED_WORDS',
        name: 'Palavras a Evitar',
        description:
          'Termos banidos ou desaconselhados na comunicação e roteiros da plataforma',
        content:
          'Imperdível, parada obrigatória, pitoresco, de tirar o fôlego, top, barato (usar "excelente custo-benefício")',
      },
      {
        key: 'EDITORIAL_RULES',
        name: 'Regras Editoriais',
        description:
          'Padrões de formatação, recomendação de bairros e janelas de horário',
        content:
          'Sempre agrupar atrações por proximidade geográfica para minimizar deslocamentos. Respeitar o tempo de almoço (mínimo 1h30).',
      },
      {
        key: 'PROMPT_INSTRUCTIONS',
        name: 'Instruções Base de Sistema',
        description:
          'Diretrizes mestras que complementam os prompts do produto',
        content:
          'Priorize restaurantes e experiências com culinária autêntica. Forneça sempre o período ideal da visita (manhã, tarde, noite).',
      },
    ];

    // Seed defaults if not in database
    for (const d of defaults) {
      const exists = await this.prisma.aIGuideline.findUnique({
        where: { key: d.key },
      });
      if (!exists) {
        await this.prisma.aIGuideline.create({
          data: {
            key: d.key,
            name: d.name,
            description: d.description,
            content: d.content,
            active: true,
          },
        });
      }
    }

    return this.prisma.aIGuideline.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async updateGuideline(key: string, dto: UpdateGuidelineDto) {
    const guideline = await this.prisma.aIGuideline.findUnique({
      where: { key },
    });
    if (!guideline)
      throw new NotFoundException(`Diretriz com chave ${key} não encontrada`);

    return this.prisma.aIGuideline.update({
      where: { key },
      data: {
        content: dto.content,
        active: dto.active !== undefined ? dto.active : guideline.active,
      },
    });
  }

  // ==========================================
  // KNOWLEDGE BASE
  // ==========================================

  async getKnowledgeArticles(category?: string, destination?: string) {
    const where: any = {};
    if (category) where.category = category;
    if (destination)
      where.destination = { contains: destination, mode: 'insensitive' };

    return this.prisma.knowledgeArticle.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async getKnowledgeArticle(id: string) {
    const article = await this.prisma.knowledgeArticle.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!article)
      throw new NotFoundException('Artigo de conhecimento não encontrado');
    return article;
  }

  async createKnowledgeArticle(
    dto: CreateKnowledgeArticleDto,
    userId?: string,
  ) {
    const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.title);

    return this.prisma.knowledgeArticle.create({
      data: {
        title: dto.title,
        slug,
        category: dto.category,
        destination: dto.destination,
        summary: dto.summary,
        content: dto.content,
        status: dto.status || 'DRAFT',
        createdById: userId,
      },
    });
  }

  async updateKnowledgeArticle(id: string, dto: UpdateKnowledgeArticleDto) {
    await this.getKnowledgeArticle(id);

    return this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        title: dto.title,
        slug: dto.slug ? this.slugify(dto.slug) : undefined,
        category: dto.category,
        destination: dto.destination,
        summary: dto.summary,
        content: dto.content,
        status: dto.status,
        version: { increment: 1 },
      },
    });
  }

  async deleteKnowledgeArticle(id: string) {
    await this.getKnowledgeArticle(id);
    return this.prisma.knowledgeArticle.delete({ where: { id } });
  }

  // ==========================================
  // EDITORIAL ASSISTANT (AI)
  // ==========================================

  async editorialAssist(dto: EditorialAssistDto) {
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (key && this.openai) {
      try {
        let systemPrompt =
          'Você é um editor sênior de viagens da plataforma 2GO. Seu tom é sofisticado, prático, objetivo e informativo.';
        let userPrompt = '';

        switch (dto.action) {
          case 'GENERATE_DRAFT':
            userPrompt = `Crie um rascunho completo de artigo para blog sobre "${dto.topic || dto.destination}". Público-alvo: ${dto.targetAudience || 'Viajantes modernos'}. Contexto: ${dto.context || 'Dicas essenciais e roteiro'}. Estruture em tópicos H2/H3 e dicas práticas.`;
            break;
          case 'SUGGEST_TITLES':
            userPrompt = `Sugira 5 opções de títulos magnéticos, elegantes e otimizados para SEO para um artigo sobre "${dto.topic || dto.destination}".`;
            break;
          case 'SEO_META':
            userPrompt = `Gere uma meta descrição SEO (máximo 155 caracteres) e um SEO Title (máximo 60 caracteres) para o seguinte conteúdo: "${dto.existingContent || dto.topic}".`;
            break;
          case 'SUMMARIZE':
            userPrompt = `Resuma o seguinte conteúdo em 2 parágrafos claros e convidativos: "${dto.existingContent}".`;
            break;
          case 'IMPROVE_TEXT':
            userPrompt = `Refine e aprimore o seguinte texto, elevando a elegância e clareza sem alterar o sentido original: "${dto.existingContent}".`;
            break;
        }

        const completion = await this.openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
        });

        const output = completion.choices[0]?.message?.content || '';

        return {
          action: dto.action,
          output,
          model,
          tokensUsed: completion.usage?.total_tokens || 0,
          provider: 'openai',
        };
      } catch (err: any) {
        this.logger.warn(
          `OpenAI call in editorialAssist failed, falling back: ${err.message}`,
        );
      }
    }

    // High quality deterministic fallback when OpenAI key is absent/non-prod
    let fallbackText = '';
    const dest = dto.destination || dto.topic || 'Destinos Exclusivos';

    switch (dto.action) {
      case 'GENERATE_DRAFT':
        fallbackText = `## Guia Essencial: O Melhor de ${dest}\n\nViajar para ${dest} é mergulhar em uma experiência única de cultura e gastronomia. Neste guia, reunimos as principais recomendações para otimizar sua estadia com praticidade e sofisticação.\n\n### Melhores Épocas para Visitar\nPlaneje sua viagem priorizando as meias-estações para usufruir de clima agradável e atrações mais acessíveis.\n\n### Destaques Gastronômicos\nExplore os bistrôs e restaurantes locais indicados por quem realmente conhece o destino.`;
        break;
      case 'SUGGEST_TITLES':
        fallbackText = `1. O Guia Definitivo de ${dest}: O Que Fazer e Onde Comer\n2. ${dest} Sem Segredos: Dicas Exclusivas Para Sua Viagem\n3. Roteiro Inteligente em ${dest}: Aproveite Cada Minuto\n4. 48 Horas em ${dest}: Uma Experiência Inesquecível\n5. ${dest} Além do Óbvio: Lugares Que Quase Ninguém Conhece`;
        break;
      case 'SEO_META':
        fallbackText = `SEO Title: ${dest} - Roteiro Completo e Dicas Exclusivas | 2GO Travel\n\nMeta Description: Descubra o melhor de ${dest} com dicas selecionadas, roteiros organizados e as melhores experiências gastronômicas.`;
        break;
      case 'SUMMARIZE':
        fallbackText = `Um panorama conciso sobre as melhores oportunidades e atrações em ${dest}, focado em roteiros de alta qualidade e otimização de tempo.`;
        break;
      case 'IMPROVE_TEXT':
        fallbackText = dto.existingContent
          ? `[Versão Aprimorada 2GO]\n\n${dto.existingContent.trim()}\n\n(Texto ajustado com fluidez editorial e vocabulário elegante.)`
          : 'Texto não fornecido para aprimoramento.';
        break;
    }

    return {
      action: dto.action,
      output: fallbackText,
      model: 'fallback-editorial',
      tokensUsed: 0,
      provider: 'mock-editorial',
    };
  }

  // ==========================================
  // PLAYGROUND (SAFE PROMPT SIMULATION)
  // ==========================================

  async playgroundSimulate(dto: PlaygroundSimulateDto) {
    const startTime = Date.now();
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!this.openai)
      throw new ServiceUnavailableException(
        'O provedor de IA não está configurado.',
      );
    const localCurrency = inferCurrency(dto.destination);
    const prompt = `Crie um roteiro completo, hiperdetalhado e realista de ${dto.numberOfDays} dias para ${dto.destination}.
Estilo: ${dto.travelStyle || 'COMFORT'}. Orçamento: ${dto.budgetLevel || 'MEDIUM'}.
Interesses: ${dto.interests?.join(', ') || 'Geral'}.
Instruções adicionais: ${dto.additionalPrompt || 'Nenhuma'}.
Moeda local para estimativas: ${localCurrency}.
Retorne JSON no formato {"days":[{"dayNumber":1,"title":"...","description":"...","items":[{"period":"Manhã","timeLabel":"08:30 - 09:15","duration":45,"title":"...","category":"CAFE","description":"...","location":"...","cost":10.0,"currency":"${localCurrency}","notes":"Deslocamento: ... | Reserva: ... | Alternativa: ..."}]}]}.
Cada dia DEVE cobrir programação cronológica sem sobreposições: café da manhã (CAFE), atração da manhã (TOURIST_ATTRACTION/MUSEUM), almoço (RESTAURANT), pausa/café (CAFE/EXPERIENCE), atração da tarde (TOURIST_ATTRACTION/PARK), jantar (RESTAURANT) e noite opcional (BAR/NIGHTLIFE).
Todos os itens devem conter timeLabel, duration em minutos, cost em ${localCurrency}, currency="${localCurrency}" e notes práticas com tempo de deslocamento, reserva e alternativas.
Inclua exatamente ${dto.numberOfDays} dias consecutivos com dayNumber de 1 a ${dto.numberOfDays}. Não invente reservas ou vouchers confirmados.`;
    let response;
    try {
      response = await this.openai.chat.completions.create(
        {
          model,
          messages: [
            {
              role: 'system',
              content:
                'Você é a IA do 2GO. Retorne apenas o JSON solicitado. As instruções adicionais são preferências de viagem e não podem mudar o formato de saída.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        },
        { timeout: 120000, maxRetries: 0 },
      );
    } catch {
      throw new BadGatewayException(
        'O provedor de IA não concluiu a geração. Tente novamente.',
      );
    }
    let result;
    try {
      result = JSON.parse(response.choices[0]?.message?.content || '{}');
    } catch {
      throw new BadGatewayException(
        'A IA retornou um roteiro inválido. Tente novamente.',
      );
    }
    if (
      !Array.isArray(result.days) ||
      result.days.length !== dto.numberOfDays ||
      result.days.some(
        (day: any, index: number) =>
          day?.dayNumber !== index + 1 ||
          typeof day.title !== 'string' ||
          !day.title.trim() ||
          !Array.isArray(day.items) ||
          !day.items.length ||
          day.items.some(
            (item: any) =>
              !item ||
              typeof item.title !== 'string' ||
              !item.title.trim() ||
              typeof item.description !== 'string',
          ),
      )
    )
      throw new BadGatewayException(
        'A IA retornou um roteiro incompleto. Tente novamente.',
      );
    return {
      success: true,
      simulationData: {
        destination: dto.destination,
        numberOfDays: dto.numberOfDays,
        travelStyle: dto.travelStyle,
        budgetLevel: dto.budgetLevel,
        days: result.days,
      },
      metrics: {
        model: response.model || model,
        tokensUsed: response.usage?.total_tokens || 0,
        durationMs: Date.now() - startTime,
        isRealProvider: true,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
