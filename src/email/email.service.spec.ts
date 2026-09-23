import { Test } from '@nestjs/testing';
import { MockEmailService } from './mock-email.service';
import { ResendEmailService } from './resend-email.service';
import { EmailService } from './email.service';
import { EmailModule } from './email.module';
import { Logger } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Email Services - Production Hardening & Fail-Closed Auditing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. MockEmailService Fail-Closed & Non-Leakage', () => {
    it('should allow instantiation and send in staging/dev', async () => {
      process.env.NODE_ENV = 'staging';
      const service = new MockEmailService();
      await expect(
        service.sendOtpEmail({
          to: 'test@2go.com',
          code: '123456',
          expiresInMinutes: 10,
        }),
      ).resolves.not.toThrow();
    });

    it('should throw immediately on instantiation in production (Production never uses MockEmailService)', () => {
      process.env.NODE_ENV = 'production';
      expect(() => new MockEmailService()).toThrow(
        'MockEmailService cannot be instantiated in production',
      );
    });
  });

  describe('2. ResendEmailService Fail-Closed in Production', () => {
    it('Production without RESEND_API_KEY -> rejected', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.RESEND_API_KEY;
      process.env.EMAIL_FROM = '2GO Travel <noreply@2gotravel.app>';

      expect(() => new ResendEmailService()).toThrow(
        'RESEND_API_KEY é obrigatório em produção',
      );
    });

    it('Production without EMAIL_FROM -> rejected', () => {
      process.env.NODE_ENV = 'production';
      process.env.RESEND_API_KEY = 're_test_123';
      delete process.env.EMAIL_FROM;

      expect(() => new ResendEmailService()).toThrow(
        'EMAIL_FROM é obrigatório em produção',
      );
    });

    it('Production with onboarding@resend.dev -> rejected', () => {
      process.env.NODE_ENV = 'production';
      process.env.RESEND_API_KEY = 're_test_123';
      process.env.EMAIL_FROM = '2GO Travel <onboarding@resend.dev>';

      expect(() => new ResendEmailService()).toThrow(
        'não pode usar onboarding@resend.dev em produção',
      );
    });

    it('Development/Staging behavior remains valid with defaults', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.EMAIL_FROM;
      process.env.RESEND_API_KEY = 're_dev_key';

      const service = new ResendEmailService();
      expect(service).toBeDefined();
    });
  });

  describe('3. Production Never Logs OTP', () => {
    it('should send email via Resend without logging the OTP code anywhere', async () => {
      process.env.NODE_ENV = 'production';
      process.env.RESEND_API_KEY = 're_test_prod_key';
      process.env.EMAIL_FROM = '2GO Travel <noreply@2gotravel.app>';
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'email_prod_otp_999' } });

      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const service = new ResendEmailService();
      const secretOtpCode = 'SUPER_SECRET_OTP_789123';

      await service.sendOtpEmail({
        to: 'user@production.com',
        code: secretOtpCode,
        expiresInMinutes: 10,
        purpose: 'LOGIN',
      });

      // Verify payload was sent to Resend
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          from: '2GO Travel <noreply@2gotravel.app>',
          to: ['user@production.com'],
          html: expect.stringContaining(secretOtpCode),
        }),
        expect.any(Object),
      );

      // Verify secret OTP is NEVER logged in logger or console
      for (const call of logSpy.mock.calls) {
        for (const arg of call) {
          if (typeof arg === 'string') {
            expect(arg).not.toContain(secretOtpCode);
          }
        }
      }
      for (const call of errorSpy.mock.calls) {
        for (const arg of call) {
          if (typeof arg === 'string') {
            expect(arg).not.toContain(secretOtpCode);
          }
        }
      }
      for (const call of consoleLogSpy.mock.calls) {
        for (const arg of call) {
          if (typeof arg === 'string') {
            expect(arg).not.toContain(secretOtpCode);
          }
        }
      }

      logSpy.mockRestore();
      errorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('4. EmailModule Resolution in Production', () => {
    it('should reject MockEmailService in production if provider is mock', async () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'mock';

      const moduleRef = Test.createTestingModule({
        imports: [EmailModule],
      });

      await expect(moduleRef.compile()).rejects.toThrow();
    });

    it('should resolve ResendEmailService in production when properly configured', async () => {
      process.env.NODE_ENV = 'production';
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 're_prod_valid';
      process.env.EMAIL_FROM = '2GO Travel <noreply@2gotravel.app>';

      const module = await Test.createTestingModule({
        imports: [EmailModule],
      }).compile();

      const service = module.get<EmailService>(EmailService);
      expect(service).toBeInstanceOf(ResendEmailService);
    });
  });
});
