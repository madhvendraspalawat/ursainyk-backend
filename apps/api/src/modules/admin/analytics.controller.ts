import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Require } from '../identity/require.decorator';
import { AnalyticsService } from './analytics.service';

const QuerySchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

function currentPeriod(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Basic R1 dashboards for the admin console. */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @Require('analytics:read')
  overview(@Query() query: unknown) {
    const { period } = QuerySchema.parse(query);
    return this.analytics.overview(period ?? currentPeriod());
  }
}
