import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';

import { env, runtime } from './env';
import { prisma } from './db';
import { registerAuthHook, registerAuthRoutes, requireUser } from './auth';
import { registerInboxRoutes } from './routes/inbox';
import { registerProductRoutes } from './routes/products';
import { registerPoRoutes } from './routes/pos';
import { registerPushRoutes } from './routes/push';
import { registerSettingsRoutes } from './routes/settings';
import {
  startScheduler,
  runTriageNudge,
  runMondayDigest,
  runLateVendorCheck,
} from './scheduler';
import { bootstrap, bootstrapSecrets } from './bootstrap';
import { html } from './lib/html';
import { layout } from './views/layout';

async function main() {
  const app = Fastify({
    logger: env.nodeEnv === 'production' ? true : { transport: undefined },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  // Must resolve before the cookie plugin reads it.
  await bootstrapSecrets();
  await app.register(cookie, { secret: runtime.sessionSecret });
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
    // The service worker must not be cached aggressively or updates never land.
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  });

  registerAuthHook(app);
  registerAuthRoutes(app);
  registerInboxRoutes(app);
  registerProductRoutes(app);
  registerPoRoutes(app);
  registerPushRoutes(app);
  registerSettingsRoutes(app);

  app.get('/healthz', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, ts: new Date().toISOString() };
  });

  // Cron endpoints, in case you ever drive these from Railway's scheduler
  // instead of the in-process timer.
  app.post('/api/cron/:job', async (req, reply) => {
    const secret = req.headers['x-cron-secret'];
    if (!env.cronSecret || secret !== env.cronSecret) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { job } = req.params as { job: string };
    switch (job) {
      case 'triage-nudge':
        return reply.send(await runTriageNudge(true));
      case 'monday-digest':
        return reply.send(await runMondayDigest(true));
      case 'late-vendor':
        return reply.send(await runLateVendorCheck(true));
      default:
        return reply.code(404).send({ error: 'unknown job' });
    }
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not found' });
    }
    const user = req.user;
    return reply.code(404).type('text/html').send(
      layout({ title: 'Not found', nav: 'none', user, bare: !user }, html`
        <h1>Not found</h1>
        <p class="lede">That page does not exist.</p>
        <a class="btn btn-ghost" href="/">Home</a>
      `),
    );
  });

  app.setErrorHandler(async (err, req, reply) => {
    app.log.error(err);
    if (req.url.startsWith('/api/')) {
      return reply.code(500).send({ error: 'server error' });
    }
    return reply.code(500).type('text/html').send(
      layout({ title: 'Something broke', bare: true }, html`
        <h1>Something broke</h1>
        <p class="lede">
          The error is in the server log. Nothing you typed was lost if you were on the
          capture screen — reopen it and your draft should still be there.
        </p>
        <a class="btn btn-ghost" href="/">Home</a>
      `),
    );
  });

  startScheduler();

  await app.listen({ port: env.port, host: env.host });

  // Loud and unmissable in the deploy log: if the platform routes to a
  // different port than this, the domain will not resolve to the app.
  console.log('');
  console.log('  ════════════════════════════════════════════════');
  console.log(`   LISTENING ON PORT ${env.port}`);
  console.log(`   host ${env.host} · tz ${env.tz}`);
  console.log('  ════════════════════════════════════════════════');
  console.log('');

  // Deliberately after listen(), not before: generating keys and seeding the
  // catalog is ~500 sequential upserts, and against a network-attached
  // database that is slow enough that health checks would fail while the port
  // was still closed. Serving an empty catalog for a few seconds on the very
  // first boot is the better trade.
  // bootstrap() swallows its own errors, but catch here too: an unhandled
  // rejection would terminate a process that is already serving traffic.
  void bootstrap().catch((err) => app.log.error({ err }, 'bootstrap failed'));
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
