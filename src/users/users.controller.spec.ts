import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  const usersService = { findById: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    const jwtUser = { userId: 'u1', email: 'a@b.com', role: 'USER' };

    it('retorna displayName e photoUrl quando existem', async () => {
      usersService.findById.mockResolvedValue({
        fullName: 'Gustavo Vieira',
        photoUrl: 'https://cdn.example/users/u1/avatar.jpg',
      });

      const res = await controller.getProfile(jwtUser);

      expect(res.user).toMatchObject({
        id: 'u1',
        userId: 'u1',
        email: 'a@b.com',
        displayName: 'Gustavo Vieira',
        photoUrl: 'https://cdn.example/users/u1/avatar.jpg',
      });
    });

    it('retorna photoUrl null quando o usuário não tem foto', async () => {
      usersService.findById.mockResolvedValue({
        fullName: 'Gustavo Vieira',
        photoUrl: null,
      });

      const res = await controller.getProfile(jwtUser);

      expect(res.user.photoUrl).toBeNull();
      expect(res.user.displayName).toBe('Gustavo Vieira');
    });

    it('não expõe campos sensíveis', async () => {
      usersService.findById.mockResolvedValue({
        fullName: 'X',
        photoUrl: null,
        passwordHash: 'secret',
      });

      const res = await controller.getProfile(jwtUser);

      expect(JSON.stringify(res)).not.toContain('secret');
      expect(res.user).not.toHaveProperty('passwordHash');
    });
  });
});
