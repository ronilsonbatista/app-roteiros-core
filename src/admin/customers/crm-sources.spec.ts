import { CustomersService } from './customers.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CustomersQueryDto, SaveContactDto } from './dto/customers.dto';

describe('CRM source separation', () => {
  const user = {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const crmContact = {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const service = new CustomersService({ user, crmContact } as any);
  beforeEach(() => {
    jest.resetAllMocks();
    user.findMany.mockResolvedValue([]);
    user.count.mockResolvedValue(0);
  });

  it('excludes administrators and applies paid status before pagination and counting', async () => {
    await service.getCustomers({ page: 2, limit: 15, stage: 'CUSTOMER_PAID' });
    const args = user.findMany.mock.calls[0][0];
    expect(args.where.AND).toContainEqual({ role: 'USER' });
    expect(args.where.AND).toContainEqual({
      purchases: { some: { status: 'PAID' } },
    });
    expect(args.skip).toBe(15);
    expect(user.count).toHaveBeenCalledWith({ where: args.where });
    expect(crmContact.findMany).not.toHaveBeenCalled();
  });

  it('does not classify free premium access or pending purchases as paid', async () => {
    user.findMany.mockResolvedValue([
      { id: 'test', role: 'USER', _count: { trips: 1 }, purchases: [] },
    ]);
    user.count.mockResolvedValue(1);
    const result = await service.getCustomers({});
    expect(result.data[0]).toMatchObject({
      stage: 'CUSTOMER_UNPAID',
      purchasesCount: 0,
      tripsCount: 1,
      totalSpent: 0,
    });
    expect(user.findMany.mock.calls[0][0].include.purchases.where).toEqual({
      status: 'PAID',
    });
  });

  it('uses paid count even for zero-value approved purchases and preserves monetary units', async () => {
    user.findMany.mockResolvedValue([
      {
        _count: { trips: 1 },
        purchases: [{ finalAmount: '90.00' }, { finalAmount: '0.00' }],
      },
    ]);
    const result = await service.getCustomers({});
    expect(result.data[0]).toMatchObject({
      stage: 'CUSTOMER_PAID',
      purchasesCount: 2,
      totalSpent: 90,
    });
  });

  it('keeps CRM contacts in their own source without creating login accounts', async () => {
    crmContact.findMany.mockResolvedValue([
      { id: 'contact', status: 'CONTACT' },
    ]);
    crmContact.count.mockResolvedValue(1);
    const result = await service.getContacts({
      page: 1,
      limit: 15,
      status: 'CONTACT',
    });
    expect(result.meta.total).toBe(1);
    expect(user.findMany).not.toHaveBeenCalled();
    await service.saveContact({
      fullName: ' Test Contact ',
      email: 'TEST@example.com',
      status: 'QUALIFIED',
    });
    expect(crmContact.create).toHaveBeenCalledWith({
      data: {
        fullName: 'Test Contact',
        email: 'test@example.com',
        status: 'QUALIFIED',
      },
    });
    expect(user.update).not.toHaveBeenCalled();
  });

  it('denies administrator ids in customer details and consent changes', async () => {
    user.findFirst.mockResolvedValue(null);
    await expect(service.getCustomer360('admin')).rejects.toThrow(
      'não encontrado',
    );
    await expect(service.updateConsent('admin', true)).rejects.toThrow(
      'não encontrado',
    );
    expect(
      user.findFirst.mock.calls.every(([args]) => args.where.role === 'USER'),
    ).toBe(true);
    expect(user.update).not.toHaveBeenCalled();
  });

  it('parses false filters correctly and rejects invalid pagination and contact status', async () => {
    const query = plainToInstance(CustomersQueryDto, {
      hasPurchases: 'false',
      hasTrips: 'false',
      hasConsent: 'false',
      page: '1',
      limit: '15',
    });
    expect(query).toMatchObject({
      hasPurchases: false,
      hasTrips: false,
      hasConsent: false,
    });
    expect(await validate(query)).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(CustomersQueryDto, { page: '1.5', limit: '999' }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(SaveContactDto, {
            fullName: 'Contact',
            email: 'contact@example.com',
            status: 'CUSTOMER_PAID',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
