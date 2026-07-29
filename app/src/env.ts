function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '3000')),
  host: optional('HOST', '0.0.0.0'),

  databaseUrl: required('DATABASE_URL'),

  /// Signs session cookies and approval tokens. Rotate and everyone logs out.
  sessionSecret: required('SESSION_SECRET'),

  /// Public origin, used to build approval links you text to Danny.
  publicUrl: optional('PUBLIC_URL', '').replace(/\/$/, ''),

  /// Web push. Generate with `npm run vapid`. Push is skipped if unset.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: optional('VAPID_SUBJECT', 'mailto:lowry@powder-ops.com'),

  /// Local timezone for digests and nudges.
  tz: optional('APP_TZ', 'America/Denver'),

  /// Local hour (0-23) for the daily triage nudge and Monday digest.
  nudgeHour: Number(optional('NUDGE_HOUR', '8')),

  /// Protects the cron HTTP endpoints if you drive them externally.
  cronSecret: process.env.CRON_SECRET || '',

  /// Seed credentials, used only by `npm run seed`.
  seedOwnerEmail: optional('SEED_OWNER_EMAIL', 'lowry@powder-ops.com'),
  seedOwnerName: optional('SEED_OWNER_NAME', 'Lowry Akers'),
  seedOwnerPassword: process.env.SEED_OWNER_PASSWORD || '',
  seedStaffEmail: process.env.SEED_STAFF_EMAIL || '',
  seedStaffName: optional('SEED_STAFF_NAME', 'Assistant'),
  seedStaffPassword: process.env.SEED_STAFF_PASSWORD || '',
};

export const pushEnabled = () => Boolean(env.vapidPublicKey && env.vapidPrivateKey);
