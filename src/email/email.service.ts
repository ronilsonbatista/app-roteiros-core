export interface SendOtpEmailOptions {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export abstract class EmailService {
  abstract sendOtpEmail(options: SendOtpEmailOptions): Promise<void>;
}
