import { Injectable, Logger } from '@nestjs/common';
import { EmailService, SendOtpEmailOptions } from './email.service';
import axios from 'axios';

@Injectable()
export class ResendEmailService implements EmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    const isProduction = process.env.NODE_ENV === 'production';
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (isProduction) {
      if (!apiKey) {
        throw new Error('FATAL: RESEND_API_KEY é obrigatório em produção!');
      }
      if (!from) {
        throw new Error(
          'FATAL: EMAIL_FROM é obrigatório em produção e deve pertencer a um domínio verificado no Resend!',
        );
      }
      if (from.includes('onboarding@resend.dev')) {
        throw new Error(
          'FATAL: EMAIL_FROM não pode usar onboarding@resend.dev em produção!',
        );
      }
      this.apiKey = apiKey;
      this.from = from;
    } else {
      this.apiKey = apiKey || '';
      this.from = from || '2GO Travel <onboarding@resend.dev>';
    }
  }

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<void> {
    const { to, code, expiresInMinutes, purpose } = options;

    if (!this.apiKey) {
      throw new Error('[ResendEmailService] RESEND_API_KEY is not configured');
    }

    const isPasswordReset = purpose === 'PASSWORD_RESET';
    const title = isPasswordReset
      ? 'Redefinição de Senha'
      : 'Seu código de acesso';
    const message = isPasswordReset
      ? 'Você solicitou a redefinição de sua senha. Use o código abaixo:'
      : 'Seu código de verificação para acesso ao 2GO é:';

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 12px;">
        <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">2GO Travel</h2>
        <p style="font-size: 15px; color: #374151; margin-bottom: 24px; line-height: 1.5;">${message}</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #111827; margin: 24px 0;">
          ${code}
        </div>
        <p style="font-size: 14px; color: #6b7280; line-height: 1.5;">Este código é válido por <strong>${expiresInMinutes} minutos</strong>.</p>
        <p style="font-size: 13px; color: #9ca3af; margin-top: 32px; border-top: 1px solid #f3f4f6; padding-top: 16px; line-height: 1.4;">
          Se você não solicitou este código, ignore este e-mail. Nenhuma ação é necessária.
        </p>
      </div>
    `;

    try {
      const response = await axios.post(
        'https://api.resend.com/emails',
        {
          from: this.from,
          to: [to],
          subject: `${title} - 2GO Travel`,
          html: htmlBody,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      // NEVER log OTP code in production or stdout
      this.logger.log(
        `[ResendEmailService] Email sent to [${to}] (id: ${response.data?.id})`,
      );
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message;
      this.logger.error(
        `[ResendEmailService] Failed to send email to [${to}]: ${errMsg}`,
      );
      throw new Error(`Falha no envio de e-mail transacional: ${errMsg}`);
    }
  }
}
