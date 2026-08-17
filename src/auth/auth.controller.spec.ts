import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;

  beforeEach(async () => {
    authService = {
      signup: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      requestOtp: jest.fn().mockResolvedValue({ success: true }),
      verifyOtp: jest.fn().mockResolvedValue({ accessToken: 'jwt', refreshToken: 'ref' }),
      logout: jest.fn().mockResolvedValue({ message: 'Logout' }),
      logoutAll: jest.fn().mockResolvedValue({ message: 'Logout all' }),
      forgotPassword: jest.fn().mockResolvedValue({ success: true }),
      resetPassword: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate requestOtp to authService', async () => {
    const result = await controller.requestOtp({ email: 'viajante@2go.com' });
    expect(result.success).toBe(true);
    expect(authService.requestOtp).toHaveBeenCalledWith({ email: 'viajante@2go.com' });
  });

  it('should delegate verifyOtp to authService', async () => {
    const result = await controller.verifyOtp({ email: 'viajante@2go.com', code: '123456' });
    expect(result.accessToken).toBe('jwt');
    expect(authService.verifyOtp).toHaveBeenCalled();
  });
});
