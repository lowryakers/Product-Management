import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { requireUser, requireOwner } from '../auth';
import { hashPassword } from '../lib/crypto';
import { html, raw } from '../lib/html';
import { layout, flash } from '../views/layout';
import { pushEnabled } from '../env';

export const LOGO_KEY = 'po_logo';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/account', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const q = req.query as Record<string, string>;
    const [logo, users, subCount] = await Promise.all([
      prisma.appAsset.findUnique({
        where: { key: LOGO_KEY },
        select: { key: true, mimeType: true, filename: true, updatedAt: true },
      }),
      user.role === 'OWNER'
        ? prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
        : Promise.resolve([]),
      prisma.pushSubscription.count({ where: { userId: user.id } }),
    ]);

    return reply.type('text/html').send(
      layout({ title: 'Settings', nav: 'more', user }, html`
        ${q.saved ? flash('ok', 'Saved.') : raw('')}
        ${q.err ? flash('err', q.err) : raw('')}

        <p class="eyebrow">Signed in</p>
        <p><strong>${user.name}</strong> · ${user.email} · ${user.role.toLowerCase()}</p>

        <hr class="divider" />

        <h2>Notifications</h2>
        ${pushEnabled()
          ? html`
              <p class="lede">
                Push works once you have added this app to your home screen and opened it
                from there. iOS does not allow notifications from a Safari tab.
              </p>
              <p class="lede">
                Devices subscribed on this account: <strong>${subCount}</strong>
              </p>
              <div class="btn-row">
                <button class="btn btn-ghost" type="button" data-push-enable>
                  Enable on this device
                </button>
                <button class="btn btn-ghost" type="button" data-push-test>Send test</button>
              </div>
              <p class="hint" data-push-status></p>
            `
          : html`
              <p class="lede">
                Push is not configured. Set <code>VAPID_PUBLIC_KEY</code> and
                <code>VAPID_PRIVATE_KEY</code> in Railway, then redeploy.
              </p>
            `}

        <hr class="divider" />

        <h2>PO logo</h2>
        <p class="lede">
          Appears in the header of every generated purchase order. PNG with a
          transparent background works best.
        </p>
        ${logo
          ? html`
              <div class="card" style="text-align:center">
                <img
                  src="/assets/${LOGO_KEY}?v=${logo.updatedAt.getTime()}"
                  alt="Current PO logo"
                  style="max-width:100%;max-height:80px;object-fit:contain"
                />
                <p class="hint" style="margin-top:.5rem">
                  ${logo.filename ?? 'uploaded'} · updated
                  ${logo.updatedAt.toISOString().slice(0, 10)}
                </p>
              </div>
            `
          : html`<p class="lede">
              No logo uploaded — POs currently render the wordmark as text.
            </p>`}
        <form method="post" action="/account/logo" enctype="multipart/form-data">
          <div class="field">
            <label class="label" for="logo">Upload a new logo</label>
            <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
            <p class="hint">PNG, JPEG or WebP. Up to 2 MB.</p>
          </div>
          <button class="btn" type="submit">Upload</button>
        </form>

        <hr class="divider" />

        <h2>Change your password</h2>
        <form method="post" action="/account/password">
          <div class="field">
            <label class="label" for="current">Current password</label>
            <input id="current" name="current" type="password" autocomplete="current-password" required />
          </div>
          <div class="field">
            <label class="label" for="next">New password</label>
            <input id="next" name="next" type="password" autocomplete="new-password" minlength="10" required />
            <p class="hint">At least 10 characters.</p>
          </div>
          <button class="btn btn-ghost" type="submit">Update password</button>
        </form>

        ${user.role === 'OWNER'
          ? html`
              <hr class="divider" />
              <h2>People</h2>
              <ul class="list">
                ${users.map(
                  (u) => html`
                    <li>
                      <div class="row">
                        <span class="row-top">
                          <span class="badge">${u.role}</span>
                          <span class="row-ref">${u.email}</span>
                        </span>
                        <p class="row-note">${u.name}</p>
                      </div>
                    </li>
                  `,
                )}
              </ul>
              <form method="post" action="/account/users">
                <div class="field">
                  <label class="label" for="nname">Name</label>
                  <input id="nname" name="name" type="text" required />
                </div>
                <div class="field">
                  <label class="label" for="nemail">Email</label>
                  <input id="nemail" name="email" type="email" required />
                </div>
                <div class="field">
                  <label class="label" for="npass">Temporary password</label>
                  <input id="npass" name="password" type="text" minlength="10" required />
                  <p class="hint">Send it to them however you like. They can change it here.</p>
                </div>
                <button class="btn btn-ghost" type="submit">Add person</button>
              </form>
            `
          : raw('')}

        <hr class="divider" />
        <form method="post" action="/logout">
          <button class="btn btn-danger" type="submit">Sign out</button>
        </form>
      `),
    );
  });

  app.post('/account/logo', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const file = await (req as any).file();
    if (!file) return reply.redirect(302, '/account?err=No+file+received');
    if (!ALLOWED.includes(file.mimetype)) {
      return reply.redirect(302, '/account?err=Use+a+PNG,+JPEG+or+WebP');
    }

    const buf = await file.toBuffer();
    if (buf.length > MAX_LOGO_BYTES) {
      return reply.redirect(302, '/account?err=File+is+larger+than+2+MB');
    }

    await prisma.appAsset.upsert({
      where: { key: LOGO_KEY },
      update: { mimeType: file.mimetype, filename: file.filename, data: buf },
      create: {
        key: LOGO_KEY,
        mimeType: file.mimetype,
        filename: file.filename,
        data: buf,
      },
    });

    return reply.redirect(302, '/account?saved=1');
  });

  app.get('/assets/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const asset = await prisma.appAsset.findUnique({ where: { key } });
    if (!asset) return reply.code(404).send('Not found');
    return reply
      .header('Content-Type', asset.mimeType)
      .header('Cache-Control', 'public, max-age=300')
      .send(Buffer.from(asset.data));
  });

  app.post('/account/password', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const b = req.body as Record<string, string>;
    const { verifyPassword } = await import('../lib/crypto');

    const record = await prisma.user.findUnique({ where: { id: user.id } });
    if (!record || !(await verifyPassword(b.current || '', record.passwordHash))) {
      return reply.redirect(302, '/account?err=Current+password+is+wrong');
    }
    if ((b.next || '').length < 10) {
      return reply.redirect(302, '/account?err=New+password+is+too+short');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(b.next) },
    });
    // Any other signed-in device is logged out.
    await prisma.session.deleteMany({ where: { userId: user.id } });
    return reply.redirect(302, '/login');
  });

  app.post('/account/users', async (req, reply) => {
    const user = requireOwner(req, reply);
    if (!user) return;
    const b = req.body as Record<string, string>;
    const email = (b.email || '').trim().toLowerCase();
    if (!email || (b.password || '').length < 10) {
      return reply.redirect(302, '/account?err=Check+the+email+and+password');
    }
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return reply.redirect(302, '/account?err=That+email+already+exists');

    await prisma.user.create({
      data: {
        email,
        name: (b.name || '').trim() || email,
        role: 'STAFF',
        passwordHash: await hashPassword(b.password),
      },
    });
    return reply.redirect(302, '/account?saved=1');
  });
}
