import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me'))) {
  throw new Error('JWT_SECRET must be set to a strong value in production');
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/hostel_entry',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  tz: process.env.APP_TZ || 'Asia/Kolkata',
  wardenInviteCode: process.env.WARDEN_INVITE_CODE || '',
  enforceExitWindow: (process.env.ENFORCE_EXIT_WINDOW ?? 'true') === 'true',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  alertJobEnabled: (process.env.ALERT_JOB_ENABLED ?? 'true') === 'true',
  isProd,
};
