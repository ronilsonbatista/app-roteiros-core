import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MockEmailService } from './mock-email.service';

@Module({
  providers: [
    {
      provide: EmailService,
      useClass: MockEmailService,
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}
