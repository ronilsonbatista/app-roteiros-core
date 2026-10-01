import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyExpenseDto } from './dto/create-company-expense.dto';
import { UpdateCompanyExpenseDto } from './dto/update-company-expense.dto';
import {
  QueryCompanyExpenseDto,
  QueryCompanyExpenseSummaryDto,
} from './dto/query-company-expense.dto';
import { CompanyExpenseCategory, Prisma } from '@prisma/client';

@Injectable()
export class CompanyExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém a competência no formato YYYY-MM a partir de uma data Date ou ISO string
   */
  private deriveCompetenceMonth(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Data inválida para cálculo de competência');
    }
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Calcula o mês de competência anterior no formato YYYY-MM
   */
  private getPreviousCompetenceMonth(competenceMonth: string): string {
    const [yearStr, monthStr] = competenceMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10);

    if (month === 1) {
      month = 12;
      year -= 1;
    } else {
      month -= 1;
    }
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  /**
   * Cadastra uma nova despesa da empresa
   */
  async create(dto: CreateCompanyExpenseDto, adminId?: string) {
    const spentAt = dto.spentAt ? new Date(dto.spentAt) : new Date();
    if (isNaN(spentAt.getTime())) {
      throw new BadRequestException('Data spentAt inválida');
    }

    const competenceMonth =
      dto.competenceMonth || this.deriveCompetenceMonth(spentAt);
    const currency = (dto.currency || 'BRL').trim().toUpperCase();

    return this.prisma.companyExpense.create({
      data: {
        title: dto.title.trim(),
        category: dto.category,
        amountCents: dto.amountCents,
        currency,
        spentAt,
        competenceMonth,
        vendor: dto.vendor?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdByAdminId: adminId || null,
      },
      include: {
        createdByAdmin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Lista despesas com filtros, paginação e ordenação
   */
  async findAll(query: QueryCompanyExpenseDto) {
    const targetMonth = query.competenceMonth || query.month;
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyExpenseWhereInput = {};

    if (targetMonth) {
      where.competenceMonth = targetMonth;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { vendor: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (!query.includeArchived) {
      where.archivedAt = null;
    }

    const orderByField = query.orderBy || 'spentAt';
    const orderDirection = query.order || 'desc';

    const [total, data] = await Promise.all([
      this.prisma.companyExpense.count({ where }),
      this.prisma.companyExpense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [orderByField]: orderDirection },
        include: {
          createdByAdmin: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Obtém o resumo financeiro de despesas de um mês de competência
   */
  async getSummary(query: QueryCompanyExpenseSummaryDto) {
    const targetMonth =
      query.competenceMonth ||
      query.month ||
      this.deriveCompetenceMonth(new Date());

    const previousMonth = this.getPreviousCompetenceMonth(targetMonth);

    // Despesas ativas do mês atual
    const currentMonthExpenses = await this.prisma.companyExpense.findMany({
      where: {
        competenceMonth: targetMonth,
        archivedAt: null,
      },
      select: {
        id: true,
        amountCents: true,
        category: true,
      },
    });

    const totalCents = currentMonthExpenses.reduce(
      (sum, item) => sum + item.amountCents,
      0,
    );
    const totalCount = currentMonthExpenses.length;

    // Agrupamento por categoria
    const categoryMap = new Map<
      CompanyExpenseCategory,
      { totalCents: number; count: number }
    >();

    // Inicializa todas as categorias possíveis com 0
    Object.values(CompanyExpenseCategory).forEach((cat) => {
      categoryMap.set(cat, { totalCents: 0, count: 0 });
    });

    currentMonthExpenses.forEach((item) => {
      const existing = categoryMap.get(item.category) || {
        totalCents: 0,
        count: 0,
      };
      existing.totalCents += item.amountCents;
      existing.count += 1;
      categoryMap.set(item.category, existing);
    });

    const byCategory = Array.from(categoryMap.entries()).map(
      ([category, stats]) => ({
        category,
        totalCents: stats.totalCents,
        count: stats.count,
        percentage:
          totalCents > 0
            ? Number(((stats.totalCents / totalCents) * 100).toFixed(1))
            : 0,
      }),
    );

    // Comparativo com mês anterior
    const previousMonthExpenses = await this.prisma.companyExpense.findMany({
      where: {
        competenceMonth: previousMonth,
        archivedAt: null,
      },
      select: {
        amountCents: true,
      },
    });

    const prevMonthTotalCents = previousMonthExpenses.reduce(
      (sum, item) => sum + item.amountCents,
      0,
    );

    const differenceCents = totalCents - prevMonthTotalCents;
    const percentageChange =
      prevMonthTotalCents > 0
        ? Number(((differenceCents / prevMonthTotalCents) * 100).toFixed(1))
        : null;

    return {
      competenceMonth: targetMonth,
      totalCents,
      totalCount,
      byCategory,
      previousMonth: {
        competenceMonth: previousMonth,
        totalCents: prevMonthTotalCents,
        differenceCents,
        percentageChange,
      },
    };
  }

  /**
   * Obtém detalhes de uma despesa por ID
   */
  async findOne(id: string) {
    const expense = await this.prisma.companyExpense.findUnique({
      where: { id },
      include: {
        createdByAdmin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException(`Despesa com ID "${id}" não encontrada`);
    }

    return expense;
  }

  /**
   * Atualiza uma despesa existente
   */
  async update(id: string, dto: UpdateCompanyExpenseDto) {
    const existing = await this.findOne(id);

    const data: Prisma.CompanyExpenseUpdateInput = {};

    if (dto.title !== undefined) {
      data.title = dto.title.trim();
    }

    if (dto.category !== undefined) {
      data.category = dto.category;
    }

    if (dto.amountCents !== undefined) {
      data.amountCents = dto.amountCents;
    }

    if (dto.currency !== undefined) {
      data.currency = dto.currency.trim().toUpperCase();
    }

    if (dto.spentAt !== undefined) {
      const parsedSpentAt = new Date(dto.spentAt);
      if (isNaN(parsedSpentAt.getTime())) {
        throw new BadRequestException('Data spentAt inválida');
      }
      data.spentAt = parsedSpentAt;

      // Se a competência não for especificada expressamente no update, sincroniza com o novo spentAt
      if (dto.competenceMonth === undefined) {
        data.competenceMonth = this.deriveCompetenceMonth(parsedSpentAt);
      }
    }

    if (dto.competenceMonth !== undefined) {
      data.competenceMonth = dto.competenceMonth;
    }

    if (dto.vendor !== undefined) {
      data.vendor = dto.vendor ? dto.vendor.trim() : null;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes ? dto.notes.trim() : null;
    }

    return this.prisma.companyExpense.update({
      where: { id: existing.id },
      data,
      include: {
        createdByAdmin: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Arquiva (soft-delete) uma despesa
   */
  async archive(id: string) {
    await this.findOne(id);
    return this.prisma.companyExpense.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  /**
   * Restaura uma despesa arquivada
   */
  async restore(id: string) {
    await this.findOne(id);
    return this.prisma.companyExpense.update({
      where: { id },
      data: { archivedAt: null },
    });
  }

  /**
   * Exclui uma despesa (soft delete por padrão ou hard delete se solicitado)
   */
  async remove(id: string, hard = false) {
    await this.findOne(id);
    if (hard) {
      return this.prisma.companyExpense.delete({
        where: { id },
      });
    }
    return this.archive(id);
  }
}
