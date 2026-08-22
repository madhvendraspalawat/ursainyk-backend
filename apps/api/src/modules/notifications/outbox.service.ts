import { Injectable } from '@nestjs/common';
import type { Prisma } from '@ursainyk/db';
import { PrismaService } from '../../prisma/prisma.service';

/** The client shape both PrismaClient and an interactive-transaction client satisfy. */
type OutboxWriter = {
  outbox: {
    create: (args: { data: Prisma.OutboxCreateInput }) => Promise<unknown>;
  };
};

/**
 * Transactional outbox (ADR-0010). Call `emit` with the SAME transaction
 * client that performs the state change — that is the whole point: the event
 * commits iff the change commits. The worker relays rows to BullMQ.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param tx the transaction client of the surrounding state change.
   *           Falls back to the root client for events with no surrounding tx.
   */
  async emit(
    eventType: string,
    payload: Prisma.InputJsonValue,
    tx?: OutboxWriter,
  ): Promise<void> {
    const client: OutboxWriter = tx ?? this.prisma.db;
    await client.outbox.create({ data: { eventType, payload } });
  }
}
