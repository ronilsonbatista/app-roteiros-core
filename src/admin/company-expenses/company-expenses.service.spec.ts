import { CompanyExpensesService } from './company-expenses.service';
import { CompanyExpenseCategory } from '@prisma/client';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('CompanyExpensesService', () => {
  let service: CompanyExpensesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      companyExpense: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new CompanyExpensesService(prisma as any);
  });

  describe('create', () => {
    it('cria despesa derivando competenceMonth automaticamente a partir de spentAt', async () => {
      const mockCreated = {
        id: 'exp-1',
        title: 'Servidores AWS',
        category: CompanyExpenseCategory.INFRA,
        amountCents: 54000,
        currency: 'BRL',
        spentAt: new Date('2026-10-05T10:00:00.000Z'),
        competenceMonth: '2026-10',
        vendor: 'AWS',
        notes: null,
        createdByAdminId: 'admin-123',
      };
      prisma.companyExpense.create.mockResolvedValue(mockCreated);

      const res = await service.create(
        {
          title: 'Servidores AWS',
          category: CompanyExpenseCategory.INFRA,
          amountCents: 54000,
          spentAt: '2026-10-05T10:00:00.000Z',
          vendor: 'AWS',
        },
        'admin-123',
      );

      expect(prisma.companyExpense.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Servidores AWS',
          category: CompanyExpenseCategory.INFRA,
          amountCents: 54000,
          currency: 'BRL',
          competenceMonth: '2026-10',
          vendor: 'AWS',
          createdByAdminId: 'admin-123',
        }),
        include: expect.any(Object),
      });
      expect(res).toEqual(mockCreated);
    });

    it('respeita competenceMonth explícito quando informado', async () => {
      prisma.companyExpense.create.mockResolvedValue({ id: 'exp-2' });

      await service.create(
        {
          title: 'Campanha Meta Ads',
          category: CompanyExpenseCategory.MARKETING,
          amountCents: 120000,
          spentAt: '2026-10-02T10:00:00.000Z',
          competenceMonth: '2026-09',
        },
        'admin-123',
      );

      expect(prisma.companyExpense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            competenceMonth: '2026-09',
          }),
        }),
      );
    });

    it('lança BadRequestException se a data spentAt for inválida', async () => {
      await expect(
        service.create({
          title: 'Inválido',
          category: CompanyExpenseCategory.OUTROS,
          amountCents: 100,
          spentAt: 'data-invalida',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('filtra por competenceMonth, categoria e oculta arquivados por padrão', async () => {
      prisma.companyExpense.count.mockResolvedValue(1);
      prisma.companyExpense.findMany.mockResolvedValue([
        { id: 'exp-1', title: 'Figma', amountCents: 9000 },
      ]);

      const result = await service.findAll({
        competenceMonth: '2026-10',
        category: CompanyExpenseCategory.SAAS,
        page: 1,
        limit: 10,
      });

      expect(prisma.companyExpense.findMany).toHaveBeenCalledWith({
        where: {
          competenceMonth: '2026-10',
          category: CompanyExpenseCategory.SAAS,
          archivedAt: null,
        },
        skip: 0,
        take: 10,
        orderBy: { spentAt: 'desc' },
        include: expect.any(Object),
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('aplica busca textual por título ou fornecedor', async () => {
      prisma.companyExpense.count.mockResolvedValue(0);
      prisma.companyExpense.findMany.mockResolvedValue([]);

      await service.findAll({
        search: 'Google',
      });

      expect(prisma.companyExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'Google', mode: 'insensitive' } },
              { vendor: { contains: 'Google', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('inclui arquivados quando includeArchived for true', async () => {
      prisma.companyExpense.count.mockResolvedValue(0);
      prisma.companyExpense.findMany.mockResolvedValue([]);

      await service.findAll({
        includeArchived: true,
      });

      expect(prisma.companyExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  describe('getSummary', () => {
    it('calcula o total de despesas, contagem e distribuição por categorias', async () => {
      // Mês atual: 2 despesas (1 INFRA de 50000, 1 SAAS de 25000)
      prisma.companyExpense.findMany
        .mockResolvedValueOnce([
          { id: '1', amountCents: 50000, category: CompanyExpenseCategory.INFRA },
          { id: '2', amountCents: 25000, category: CompanyExpenseCategory.SAAS },
        ])
        // Mês anterior: 1 despesa de 60000
        .mockResolvedValueOnce([{ amountCents: 60000 }]);

      const summary = await service.getSummary({ competenceMonth: '2026-10' });

      expect(summary.competenceMonth).toBe('2026-10');
      expect(summary.totalCents).toBe(75000);
      expect(summary.totalCount).toBe(2);

      const infraCategory = summary.byCategory.find((c) => c.category === 'INFRA');
      expect(infraCategory).toBeDefined();
      expect(infraCategory?.totalCents).toBe(50000);
      expect(infraCategory?.count).toBe(1);
      expect(infraCategory?.percentage).toBe(66.7);

      const saasCategory = summary.byCategory.find((c) => c.category === 'SAAS');
      expect(saasCategory?.totalCents).toBe(25000);
      expect(saasCategory?.percentage).toBe(33.3);

      expect(summary.previousMonth.competenceMonth).toBe('2026-09');
      expect(summary.previousMonth.totalCents).toBe(60000);
      expect(summary.previousMonth.differenceCents).toBe(15000);
      expect(summary.previousMonth.percentageChange).toBe(25);
    });
  });

  describe('findOne', () => {
    it('retorna despesa quando existe', async () => {
      const mock = { id: 'exp-1', title: 'Gasto 1' };
      prisma.companyExpense.findUnique.mockResolvedValue(mock);

      const result = await service.findOne('exp-1');
      expect(result).toEqual(mock);
    });

    it('lança NotFoundException se não existir', async () => {
      prisma.companyExpense.findUnique.mockResolvedValue(null);

      await expect(service.findOne('exp-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza valores e sincroniza competenceMonth se spentAt mudar', async () => {
      prisma.companyExpense.findUnique.mockResolvedValue({ id: 'exp-1', title: 'Antigo' });
      prisma.companyExpense.update.mockResolvedValue({ id: 'exp-1', title: 'Novo' });

      await service.update('exp-1', {
        title: 'Novo',
        amountCents: 30000,
        spentAt: '2026-11-15T12:00:00.000Z',
      });

      expect(prisma.companyExpense.update).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        data: expect.objectContaining({
          title: 'Novo',
          amountCents: 30000,
          competenceMonth: '2026-11',
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('archive and remove', () => {
    it('archive marca archivedAt com timestamp', async () => {
      prisma.companyExpense.findUnique.mockResolvedValue({ id: 'exp-1' });
      prisma.companyExpense.update.mockResolvedValue({ id: 'exp-1', archivedAt: new Date() });

      await service.archive('exp-1');

      expect(prisma.companyExpense.update).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
        data: { archivedAt: expect.any(Date) },
      });
    });

    it('remove com hard=true realiza exclusão física no banco', async () => {
      prisma.companyExpense.findUnique.mockResolvedValue({ id: 'exp-1' });
      prisma.companyExpense.delete.mockResolvedValue({ id: 'exp-1' });

      await service.remove('exp-1', true);

      expect(prisma.companyExpense.delete).toHaveBeenCalledWith({
        where: { id: 'exp-1' },
      });
    });
  });
});
