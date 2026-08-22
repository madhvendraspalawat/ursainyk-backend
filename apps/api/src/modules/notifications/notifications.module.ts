import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';

/**
 * NotificationsModule — transactional outbox producer (ADR-0010).
 * Channel senders (FCM/MSG91/WhatsApp/SES) live in the worker; the API only
 * ever writes outbox rows inside its transactions. Global: every module emits.
 */
@Global()
@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class NotificationsModule {}
