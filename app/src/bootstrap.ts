/**
 * First-boot setup, so deploying never depends on having a shell in the
 * running container.
 *
 *   - VAPID push keys generate themselves and persist in the database
 *   - the catalog seeds itself the first time the database is empty, and the
 *     temporary password is printed to the deploy log
 *
 * Both are idempotent: the keys are generated once and reused, and the seed
 * only runs when there are zero users.
 */

import { createHash, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import { prisma } from './db';
import { env, runtime } from './env';

const VAPID_PUBLIC = 'vapid_public_key';
const VAPID_PRIVATE = 'vapid_private_key';
const SESSION_SECRET = 'session_secret';
const RESET_APPLIED = 'password_reset_applied';

async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Environment variables win when set, so an existing deployment keeps working.
 * Otherwise keys come from the database, and are generated on the very first
 * boot. Generated keys must persist — regenerating them silently unsubscribes
 * every phone.
 */
export async function ensureVapidKeys(): Promise<'env' | 'stored' | 'generated'> {
  if (env.vapidPublicKey && env.vapidPrivateKey) {
    runtime.vapidPublicKey = env.vapidPublicKey;
    runtime.vapidPrivateKey = env.vapidPrivateKey;
    return 'env';
  }

  const [pub, priv] = await Promise.all([getSetting(VAPID_PUBLIC), getSetting(VAPID_PRIVATE)]);
  if (pub && priv) {
    runtime.vapidPublicKey = pub;
    runtime.vapidPrivateKey = priv;
    return 'stored';
  }

  const keys = webpush.generateVAPIDKeys();
  await setSetting(VAPID_PUBLIC, keys.publicKey);
  await setSetting(VAPID_PRIVATE, keys.privateKey);
  runtime.vapidPublicKey = keys.publicKey;
  runtime.vapidPrivateKey = keys.privateKey;
  return 'generated';
}

/**
 * Seeds only when the database has no users at all — i.e. the very first boot
 * against a fresh Postgres. Never touches an existing deployment.
 */
export async function maybeSeed(): Promise<boolean> {
  const users = await prisma.user.count();
  if (users > 0) return false;

  console.log('');
  console.log('  No users found — first boot. Loading the catalog…');
  console.log('');

  const { runSeed } = await import('./lib/seed.js');
  const result = await runSeed(prisma);

  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────');
  console.log('  │  SIGN IN WITH');
  console.log(`  │    ${result.ownerEmail}`);
  if (result.ownerPassword) {
    console.log(`  │    ${result.ownerPassword}`);
  } else {
    console.log('  │    (the password you set in SEED_OWNER_PASSWORD)');
  }
  if (result.staffEmail) {
    console.log('  │');
    console.log(`  │  ${result.staffEmail}`);
    console.log(`  │    ${result.staffPassword ?? '(the password you set)'}`);
  }
  console.log('  │');
  console.log('  │  Change it under Settings once you are in.');
  console.log('  └──────────────────────────────────────────────────────────');
  console.log('');

  return true;
}

/**
 * Resolves the cookie-signing secret. Must run before the cookie plugin is
 * registered, hence its own entry point separate from bootstrap().
 */
export async function bootstrapSecrets(): Promise<void> {
  if (env.sessionSecret) {
    runtime.sessionSecret = env.sessionSecret;
    return;
  }
  const stored = await getSetting(SESSION_SECRET);
  if (stored) {
    runtime.sessionSecret = stored;
    return;
  }
  const generated = randomBytes(48).toString('base64url');
  await setSetting(SESSION_SECRET, generated);
  runtime.sessionSecret = generated;
  console.log('  Generated and stored a session secret.');
}

/**
 * Emergency password reset. There is no email in this deployment, so a
 * forgotten or mistyped password would otherwise lock the account out
 * permanently. Setting RESET_PASSWORD_TO and redeploying resets it.
 *
 * Deliberately loud in the log, and deliberately requires deleting the variable
 * afterwards — a password sitting in the environment is a standing risk.
 */
export async function maybePasswordReset(): Promise<void> {
  if (!env.resetPasswordTo) return;

  const email = (env.resetPasswordEmail || env.seedOwnerEmail).toLowerCase();

  // One-shot. Without this, forgetting to delete the variable silently reverts
  // the password on every deploy — including a password changed in Settings
  // afterwards, which is baffling from the outside.
  const fingerprint = createHash('sha256')
    .update(`${email}:${env.resetPasswordTo}`)
    .digest('hex');
  if ((await getSetting(RESET_APPLIED)) === fingerprint) {
    console.log('  RESET_PASSWORD_TO already applied — skipping. Safe to delete the variable.');
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`  RESET_PASSWORD_TO is set but no account exists for ${email}`);
    return;
  }

  const { hashPassword } = await import('./lib/crypto.js');
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(env.resetPasswordTo) },
  });
  // Any session signed with the old credential is no longer trustworthy.
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await setSetting(RESET_APPLIED, fingerprint);

  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────');
  console.log('  │  PASSWORD RESET');
  console.log(`  │    ${email} can now sign in with RESET_PASSWORD_TO`);
  console.log('  │');
  console.log('  │  DELETE the RESET_PASSWORD_TO variable once you are in.');
  console.log('  └──────────────────────────────────────────────────────────');
  console.log('');
}

/**
 * Runs after the server is already listening, so it must never throw — an
 * unhandled rejection here would kill a process that is otherwise healthy and
 * serving. Every failure is logged and swallowed; the app keeps running with
 * push disabled and/or an empty catalog, both of which are recoverable.
 */
export async function bootstrap(): Promise<void> {
  try {
    const vapid = await ensureVapidKeys();
    if (vapid === 'generated') {
      console.log('  Generated and stored a VAPID key pair — push is ready to enable.');
    }
  } catch (err) {
    console.error(
      '  Could not set up push keys:',
      err instanceof Error ? err.message : err,
    );
  }

  // Seed first: on a brand-new database there is no account for a reset to
  // target, so running the reset before the seed made it a silent no-op.
  try {
    await maybeSeed();
  } catch (err) {
    // A failed seed must not stop the app from serving; the catalog can always
    // be loaded later with `npm run seed`.
    console.error('  Seed on first boot failed:', err instanceof Error ? err.message : err);
  }

  try {
    await maybePasswordReset();
  } catch (err) {
    console.error(
      '  Password reset failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
