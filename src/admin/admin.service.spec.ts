import { AdminService } from './admin.service';
import { Role } from '@prisma/client';

describe('Separação entre viajantes e administradores', () => {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const service = new AdminService(prisma as never);
  beforeEach(() => jest.clearAllMocks());
  it('filtra USER na consulta e no total, mesmo com busca', async () => {
    await service.getUsers(1, 10, 'admin');
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: Role.USER,
          OR: expect.any(Array),
        }),
      }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ role: Role.USER }),
    });
  });
  it('separa administradores e normaliza paginação inválida', async () => {
    await service.getUsers(NaN, -1, undefined, Role.ADMIN);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: Role.ADMIN },
        skip: 0,
        take: 1,
      }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: Role.ADMIN },
    });
  });
});
