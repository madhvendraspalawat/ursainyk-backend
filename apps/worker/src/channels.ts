import nodemailer from 'nodemailer';

/**
 * Notification channel senders (ADR-0010 fan-out). Each is enabled by its
 * config; unconfigured channels fall back to a structured console line so the
 * pipeline stays exercisable in dev. Never log message bodies with PII beyond
 * what the channel itself requires.
 */
export interface Rendered {
  subject?: string;
  body: string;
}

export interface ChannelSender {
  readonly channel: 'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH';
  configured(): boolean;
  send(to: string, message: Rendered): Promise<void>;
}

/** MSG91 Flow API — same integration surface as the OTP sender. */
export class Msg91Sms implements ChannelSender {
  readonly channel = 'SMS' as const;

  configured(): boolean {
    return Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_NOTIFY_TEMPLATE_ID);
  }

  async send(to: string, message: Rendered): Promise<void> {
    const res = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: process.env.MSG91_AUTH_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({
        template_id: process.env.MSG91_NOTIFY_TEMPLATE_ID,
        recipients: [{ mobiles: to.replace(/^\+/, ''), message: message.body }],
      }),
    });
    if (!res.ok) throw new Error(`msg91 ${res.status}`);
  }
}

/** WhatsApp Business Cloud API (Meta graph). */
export class WhatsAppCloud implements ChannelSender {
  readonly channel = 'WHATSAPP' as const;

  configured(): boolean {
    return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }

  async send(to: string, message: Rendered): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/^\+/, ''),
          type: 'text',
          text: { body: message.body },
        }),
      },
    );
    if (!res.ok) throw new Error(`whatsapp ${res.status}`);
  }
}

/** SMTP — Mailpit locally (localhost:1025), SES SMTP in production. */
export class SmtpEmail implements ChannelSender {
  readonly channel = 'EMAIL' as const;
  private readonly transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false,
    ...(process.env.SMTP_USER && {
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    }),
  });

  configured(): boolean {
    return process.env.SMTP_DISABLED !== '1'; // Mailpit default makes email always-on in dev
  }

  async send(to: string, message: Rendered): Promise<void> {
    await this.transport.sendMail({
      from: process.env.SMTP_FROM ?? 'no-reply@ursainyk.local',
      to,
      subject: message.subject ?? 'Ursainyk update',
      text: message.body,
    });
  }
}

/** FCM push lands with the mobile workstream (needs device tokens). */
export class FcmPush implements ChannelSender {
  readonly channel = 'PUSH' as const;

  configured(): boolean {
    return false; // device-token registry not built yet
  }

  send(): Promise<void> {
    return Promise.reject(new Error('push not configured'));
  }
}

export function allSenders(): ChannelSender[] {
  return [new Msg91Sms(), new WhatsAppCloud(), new SmtpEmail(), new FcmPush()];
}
