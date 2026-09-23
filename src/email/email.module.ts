import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MockEmailService } from './mock-email.service';
import { ResendEmailService } from './resend-email.service';

@Module({
  providers: [
    MockEmailService,
    ResendEmailService,
    {
      provide: EmailService,
      useFactory: (mock: MockEmailService, resend: ResendEmailService) => {
        const provider = process.env.EMAIL_PROVIDER;
        const isProduction = process.env.NODE_ENV === 'production';

        if (provider === 'resend' || (isProduction && provider !== 'mock')) {
          return resend;
        }

        if (isProduction && provider === 'mock') {
          throw new Error('FATAL: MockEmailService is forbidden in production!');
        }

        return mock;
      },
      inject: [MockEmailService, ResendEmailService],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
