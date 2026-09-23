import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MockEmailService } from './mock-email.service';
import { ResendEmailService } from './resend-email.service';

@Module({
  providers: [
    {
      provide: MockEmailService,
      useFactory: () => {
        if (process.env.NODE_ENV === 'production') {
          return null as any;
        }
        return new MockEmailService();
      },
    },
    {
      provide: ResendEmailService,
      useFactory: () => {
        if (
          process.env.NODE_ENV === 'production' &&
          (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
        ) {
          return null as any;
        }
        return new ResendEmailService();
      },
    },
    {
      provide: EmailService,
      useFactory: (mock: MockEmailService, resend: ResendEmailService) => {
        const isProduction = process.env.NODE_ENV === 'production';
        const provider = process.env.EMAIL_PROVIDER;

        if (isProduction) {
          if (provider === 'mock') {
            throw new Error('FATAL: EMAIL_PROVIDER=mock é proibido em produção!');
          }
          if (!resend) {
            throw new Error(
              'FATAL: RESEND_API_KEY e EMAIL_FROM são obrigatórios em produção!',
            );
          }
          return resend;
        }

        if (provider === 'resend') {
          return resend || new ResendEmailService();
        }

        return mock || new MockEmailService();
      },
      inject: [MockEmailService, ResendEmailService],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
