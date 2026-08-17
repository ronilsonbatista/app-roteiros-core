import { Injectable, Logger } from '@nestjs/common';
import { EmailService, SendOtpEmailOptions } from './email.service';

@Injectable()
export class MockEmailService implements EmailService {
  private readonly logger = new Logger(MockEmailService.name);

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<void> {
    const { to, code, expiresInMinutes } = options;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #000000; margin-bottom: 16px;">2GO Travel App</h2>
        <p style="font-size: 16px; color: #333333;">Seu código de verificação é:</p>
        <div style="background-color: #f4f4f6; padding: 16px; border-radius: 6px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #000000; margin: 20px 0;">
          ${code}
        </div>
        <p style="font-size: 14px; color: #666666;">Este código é válido por ${expiresInMinutes} minutos.</p>
        <p style="font-size: 12px; color: #999999; margin-top: 24px;">Se você não solicitou este código, por favor ignore esta mensagem.</p>
      </div>
    `;

    this.logger.log(`[MockEmailService] Sending OTP Code [${code}] to [${to}] (valid for ${expiresInMinutes}m)`);
  }
}
