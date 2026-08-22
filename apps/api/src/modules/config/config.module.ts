import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

/** ConfigModule — Super Admin: territories + system config / feature flags. */
@Module({
  controllers: [ConfigController],
  providers: [ConfigService],
})
export class ConfigModule {}
