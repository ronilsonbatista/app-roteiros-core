import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { OtpPurpose } from '@prisma/client';
import { HttpException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let emailService: any;
  let usersService: any;

  beforeEach(async () => {
    prisma = {
      authOtp: {
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    emailService = {
      sendOtpEmail: jest.fn().mockResolvedValue(undefined),
    };

    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock_jwt_token'),
            verifyAsync: jest.fn(),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requestOtp', () => {
    it('should generate OTP code and send email', async () => {
      prisma.authOtp.findFirst.mockResolvedValue(null);
      prisma.authOtp.create.mockResolvedValue({ id: 'otp_123' });

      const result = await service.requestOtp({ email: 'test@2go.com' });

      expect(result.success).toBe(true);
      expect(prisma.authOtp.create).toHaveBeenCalled();
      expect(emailService.sendOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@2go.com' }),
      );
    });

    it('should throw 429 rate limit error when requested too quickly', async () => {
      prisma.authOtp.findFirst.mockResolvedValue({ id: 'recent_otp' });

      await expect(
        service.requestOtp({ email: 'test@2go.com' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('verifyOtp', () => {
    it('should verify valid OTP, create passwordless user and return tokens', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      prisma.authOtp.findFirst.mockResolvedValue({
        id: 'otp_123',
        codeHash,
        attemptCount: 0,
      });
      usersService.findByEmail.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user_new',
        email: 'test@2go.com',
        fullName: 'Test',
        role: 'USER',
        emailConfirmed: true,
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 'ref_123' });

      const response = await service.verifyOtp({
        email: 'test@2go.com',
        code: '123456',
      });

      expect(response.accessToken).toBe('mock_jwt_token');
      expect(response.user.email).toBe('test@2go.com');
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should throw error for invalid code', async () => {
      const codeHash = await bcrypt.hash('654321', 10);
      prisma.authOtp.findFirst.mockResolvedValue({
        id: 'otp_123',
        codeHash,
        attemptCount: 0,
      });

      await expect(
        service.verifyOtp({ email: 'test@2go.com', code: '123456' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('logoutAll', () => {
    it('should revoke all active user refresh tokens', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.logoutAll('user_123');
      expect(result.message).toContain('encerradas');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user_123', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
