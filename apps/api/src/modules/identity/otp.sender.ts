import { Injectable, Logger } from '@nestjs/common';

/** Provider interface — MSG91 implementation lands with the integrations workstream. */
export abstract class OtpSender {
  abstract send(phone: string, code: string): Promise<void>;
}

/** Dev-only: logs the code. Never wired in production (no PII in logs applies to prod logger config). */
@Injectable()
export class DevConsoleOtpSender extends OtpSender {
  private readonly logger = new Logger('DevConsoleOtpSender');

  send(phone: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phone}: ${code}`);
    return Promise.resolve();
  }
}
