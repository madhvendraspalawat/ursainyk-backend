import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type Db } from '@ursainyk/db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: Db;

  constructor() {
    // Dev fallback matches docker-compose; real environments set DATABASE_URL.
    this.db = createPrismaClient(
      process.env.DATABASE_URL ??
        'postgresql://nabhahita:nabhahita@localhost:5432/nabhahita',
    );
  }

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
