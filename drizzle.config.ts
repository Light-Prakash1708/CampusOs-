import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env' });

export default {
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: false,
} satisfies Config;
