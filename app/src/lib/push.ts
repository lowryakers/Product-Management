import webpush from 'web-push';
import { prisma } from '../db';
import { env, runtime, pushEnabled } from '../env';

let configured = false;

function configure() {
  if (configured || !pushEnabled()) return;
  webpush.setVapidDetails(env.vapidSubject, runtime.vapidPublicKey, runtime.vapidPrivateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Sends to every subscription for the given users. Dead subscriptions (410/404)
 * are pruned rather than retried — a phone that reinstalled the app will
 * resubscribe on next open.
 */
export async function sendPush(
  userIds: string[],
  payload: PushPayload,
  kind = 'generic',
): Promise<{ sent: number; pruned: number }> {
  if (!pushEnabled() || userIds.length === 0) return { sent: 0, pruned: 0 };
  configure();

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  let sent = 0;
  let pruned = 0;
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          pruned++;
        } else {
          // eslint-disable-next-line no-console
          console.error('push failed', status, err?.body ?? err?.message);
        }
      }
    }),
  );

  await prisma.notificationLog.create({
    data: { kind, payload: payload as any, succeeded: sent > 0 },
  });

  return { sent, pruned };
}
