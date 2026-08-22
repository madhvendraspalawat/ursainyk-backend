import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OtpSender } from './otp.sender';

/**
 * MSG91 Flow API sender (ADR-0004). Sends OUR generated code via an approved
 * DLT template with a `##code##` variable. Selected by the OtpSender factory
 * when MSG91_AUTH_KEY + MSG91_TEMPLATE_ID are set; DevConsoleOtpSender otherwise.
 */
@Injectable()
export class Msg91OtpSender extends OtpSender {
  private readonly logger = new Logger('Msg91OtpSender');

  async send(phone: string, code: string): Promise<void> {
    const authkey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;
    if (!authkey || !templateId)
      throw new ServiceUnavailableException('MSG91 not configured');

    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey, 'content-type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        recipients: [{ mobiles: phone.replace(/^\+/, ''), code }],
      }),
    });
    if (!res.ok) {
      // Never log the code or the full phone number.
      this.logger.error(
        `MSG91 send failed: ${res.status} for ${phone.slice(0, 6)}…`,
      );
      throw new ServiceUnavailableException('OTP delivery failed');
    }
  }
}

export function otpSenderFactory(
  dev: OtpSender,
  msg91: Msg91OtpSender,
): OtpSender {
  return process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID
    ? msg91
    : dev;
}
