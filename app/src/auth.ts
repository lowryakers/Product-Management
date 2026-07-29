import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from './db';
import { env } from './env';
import { verifyPassword } from './lib/crypto';
import { html } from './lib/html';
import { layout, flash } from './views/layout';

const COOKIE = 'pd_session';
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export async function loadUser(req: FastifyRequest): Promise<SessionUser | null> {
  const raw = req.cookies[COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;

  const session = await prisma.session.findUnique({
    where: { id: unsigned.value },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
}

/** Attach req.user on every request. Does not enforce anything. */
export function registerAuthHook(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    req.user = await loadUser(req);
  });
}

/** Redirects to login, preserving where the user was headed. */
export function requireUser(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (req.user) return req.user;
  const next = encodeURIComponent(req.url);
  reply.redirect(302, `/login?next=${next}`);
  return null;
}

export function requireOwner(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  const user = requireUser(req, reply);
  if (!user) return null;
  if (user.role !== 'OWNER') {
    reply.code(403).type('text/html').send(
      layout({ title: 'Not allowed', bare: true }, html`
        <h1>Not allowed</h1>
        <p class="lede">That area is limited to the account owner.</p>
        <a class="btn btn-ghost" href="/">Back</a>
      `),
    );
    return null;
  }
  return user;
}

async function createSession(userId: string, reply: FastifyReply) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  reply.setCookie(COOKIE, session.id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    signed: true,
    expires: expiresAt,
  });
}

function loginPage(opts: { error?: string; next?: string; email?: string }) {
  return layout({ title: 'Sign in', bare: true }, html`
    <p class="eyebrow">ProDough · Powder Ops</p>
    <h1>Product Management</h1>
    ${opts.error ? flash('err', opts.error) : html``}
    <form method="post" action="/login">
      <input type="hidden" name="next" value="${opts.next ?? '/'}" />
      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="username"
          inputmode="email"
          required
          value="${opts.email ?? ''}"
        />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <button class="btn btn-block" type="submit">Sign in</button>
    </form>
  `);
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.get('/login', async (req, reply) => {
    if (req.user) return reply.redirect(302, '/');
    const next = typeof (req.query as any)?.next === 'string' ? (req.query as any).next : '/';
    return reply.type('text/html').send(loginPage({ next }));
  });

  app.post('/login', async (req, reply) => {
    const body = req.body as Record<string, string>;
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const next = safeNext(body.next);

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user ? await verifyPassword(password, user.passwordHash) : false;

    if (!user || !ok) {
      // Deliberately vague — do not confirm whether the address exists.
      return reply
        .code(401)
        .type('text/html')
        .send(loginPage({ error: 'That email and password do not match.', next, email }));
    }

    await createSession(user.id, reply);
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    return reply.redirect(302, next);
  });

  app.post('/logout', async (req, reply) => {
    const raw = req.cookies[COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        await prisma.session.deleteMany({ where: { id: unsigned.value } });
      }
    }
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.redirect(302, '/login');
  });
}

/** Only allow same-origin relative paths as a post-login redirect. */
function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
