import { MockEmailService } from './mock-email.service';
import { ResendEmailService } from './resend-email.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Email Services', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('MockEmailService', () => {
    it('should send email in development/staging', async () => {
      process.env.NODE_ENV = 'staging';
      const service = new MockEmailService();
      await expect(
        service.sendOtpEmail({ to: 'test@2go.com', code: '123456', expiresInMinutes: 10 }),
      ).resolves.not.toThrow();
    });

    it('should throw fatal error in production', async () => {
      process.env.NODE_ENV = 'production';
      const service = new MockEmailService();
      await expect(
        service.sendOtpEmail({ to: 'test@2go.com', code: '123456', expiresInMinutes: 10 }),
      ).rejects.toThrow('MockEmailService is strictly forbidden in production');
    });
  });

  describe('ResendEmailService', () => {
    it('should throw if RESEND_API_KEY is not configured', async () => {
      delete process.env.RESEND_API_KEY;
      const service = new ResendEmailService();
      await expect(
        service.sendOtpEmail({ to: 'test@2go.com', code: '123456', expiresInMinutes: 10 }),
      ).rejects.toThrow('RESEND_API_KEY is not configured');
    });

    it('should call Resend API with correct payload when key is present', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123';
      process.env.EMAIL_FROM = '2GO Travel <noreply@2gotravel.app>';
      mockedAxios.post.mockResolvedValueOnce({ data: { id: 'email_123' } });

      const service = new ResendEmailService();
      await service.sendOtpEmail({
        to: 'user@example.com',
        code: '654321',
        expiresInMinutes: 10,
        purpose: 'LOGIN',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          from: '2GO Travel <noreply@2gotravel.app>',
          to: ['user@example.com'],
          subject: expect.stringContaining('2GO Travel'),
          html: expect.stringContaining('654321'),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_key_123',
          }),
        }),
      );
    });
  });
});
