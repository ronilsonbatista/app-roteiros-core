import { Injectable, Logger } from '@nestjs/common';
import { EmailService, SendOtpEmailOptions } from './email.service';

@Injectable()
export class MockEmailService implements EmailService {
  private readonly logger = new Logger(MockEmailService.name);

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: MockEmailService cannot be instantiated in production!',
      );
    }
  }

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<void> {
    const { to, code, expiresInMinutes } = options;

    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: MockEmailService is strictly forbidden in production!',
      );
    }

    this.logger.log(
      `[MockEmailService] Sending OTP Code [${code}] to [${to}] (valid for ${expiresInMinutes}m)`,
    );
  }
}
