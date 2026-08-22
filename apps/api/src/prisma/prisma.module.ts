import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global so bounded-context modules inject PrismaService without re-importing. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
