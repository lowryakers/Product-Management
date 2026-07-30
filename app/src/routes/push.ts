import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { runtime, pushEnabled } from '../env';
import { requireUser } from '../auth';
import { sendPush } from '../lib/push';

export function registerPushRoutes(app: FastifyInstance) {
  /** The browser needs the public VAPID key before it can subscribe. */
  app.get('/api/push/key', async (req, reply) => {
    if (!pushEnabled()) return reply.send({ enabled: false });
    return reply.send({ enabled: true, key: runtime.vapidPublicKey });
  });

  app.post('/api/push/subscribe', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const body = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return reply.code(400).send({ error: 'invalid subscription' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    });

    return reply.send({ ok: true });
  });

  app.post('/api/push/unsubscribe', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const endpoint = (req.body as any)?.endpoint;
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    }
    return reply.send({ ok: true });
  });

  /** Fires a test notification so you can confirm it works on the phone. */
  app.post('/api/push/test', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const result = await sendPush(
      [user.id],
      {
        title: 'ProDough PM',
        body: 'Notifications are working.',
        url: '/',
        tag: 'test',
      },
      'test',
    );
    return reply.send({ ok: true, ...result });
  });
}
