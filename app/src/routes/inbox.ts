import type { FastifyInstance } from 'fastify';
import { InboxArea, InboxChannel, InboxStatus, Priority } from '@prisma/client';
import { prisma } from '../db';
import { requireUser } from '../auth';
import { html, raw, Html } from '../lib/html';
import { layout, emptyState, flash } from '../views/layout';

const AREAS: Array<[InboxArea, string]> = [
  ['ARTWORK', 'Artwork'],
  ['FORMULA', 'Formula'],
  ['NFP', 'NFP'],
  ['SPEC', 'Spec'],
  ['PO', 'PO'],
  ['NEW_SKU', 'New SKU'],
  ['SKU', 'SKU'],
  ['GTIN', 'GTIN'],
  ['SHOPIFY', 'Shopify'],
  ['VENDOR', 'Vendor'],
  ['OTHER', 'Other'],
];

const CHANNELS: Array<[InboxChannel, string]> = [
  ['TEXT', 'Text'],
  ['IN_PERSON', 'In person'],
  ['CALL', 'Call'],
  ['EMAIL', 'Email'],
  ['SLACK', 'Slack'],
];

const PRIORITIES: Array<[Priority, string]> = [
  ['CRITICAL', 'Critical'],
  ['HIGH', 'High'],
  ['MEDIUM', 'Medium'],
  ['LOW', 'Low'],
];

const STATUSES: Array<[InboxStatus, string]> = [
  ['NEW', 'New'],
  ['TRIAGED', 'Triaged'],
  ['IN_PROGRESS', 'In progress'],
  ['BLOCKED', 'Blocked'],
  ['DONE', 'Done'],
];

const label = (pairs: Array<[string, string]>, key: string) =>
  pairs.find(([k]) => k === key)?.[1] ?? key;

function badgeClass(status: InboxStatus, priority: Priority): string {
  if (status === 'DONE') return 'badge badge-done';
  if (status === 'NEW') return 'badge badge-new';
  if (priority === 'CRITICAL') return 'badge badge-crit';
  if (priority === 'HIGH') return 'badge badge-high';
  return 'badge';
}

function relativeDay(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toISOString().slice(0, 10);
}

function segGroup(
  name: string,
  pairs: Array<[string, string]>,
  selected: string,
): Html {
  return html`
    <div class="seg">
      ${pairs.map(
        ([value, text], i) => html`
          <input
            type="radio"
            name="${name}"
            id="${name}-${value}"
            value="${value}"
            ${value === selected ? raw('checked') : raw('')}
          /><label for="${name}-${value}">${text}</label>
        `,
      )}
    </div>
  `;
}

export function registerInboxRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------- home
  app.get('/', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const [newCount, openCount, overdue, recent] = await Promise.all([
      prisma.inboxItem.count({ where: { status: 'NEW' } }),
      prisma.inboxItem.count({ where: { status: { notIn: ['DONE'] } } }),
      prisma.inboxItem.count({
        where: { status: { notIn: ['DONE'] }, dueDate: { lt: new Date() } },
      }),
      prisma.inboxItem.findMany({
        where: { status: { notIn: ['DONE'] } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 8,
        include: { sourceContact: true, products: { select: { sku: true } } },
      }),
    ]);

    return reply.type('text/html').send(
      layout({ title: 'Today', nav: 'triage', user }, html`
        <div class="stat-row">
          <div class="stat stat-accent"><b>${newCount}</b><span>To triage</span></div>
          <div class="stat"><b>${openCount}</b><span>Open</span></div>
          <div class="stat ${overdue > 0 ? 'stat-crit' : 'stat-ok'}">
            <b>${overdue}</b><span>Overdue</span>
          </div>
        </div>

        <div class="btn-row">
          <a class="btn" href="/capture">Capture something</a>
          ${newCount > 0
            ? html`<a class="btn btn-ghost" href="/inbox?status=NEW">Triage ${newCount}</a>`
            : raw('')}
        </div>

        <h2>Open items</h2>
        ${recent.length === 0
          ? emptyState(
              'Nothing open',
              'Everything logged has been dealt with. Capture the next thing as it happens.',
              html`<a class="btn" href="/capture">Capture</a>`,
            )
          : itemList(recent)}
      `),
    );
  });

  // ---------------------------------------------------------- capture
  app.get('/capture', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const contacts = await prisma.contact.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    const saved = (req.query as any)?.saved;

    return reply.type('text/html').send(
      layout({ title: 'Capture', nav: 'capture', user }, html`
        ${saved ? flash('ok', 'Logged. Triage it later — you are done here.') : raw('')}
        <p class="lede">
          Ten seconds. Only the last field is required — leave anything you are unsure
          about blank and sort it out at triage.
        </p>

        <form method="post" action="/capture" id="capture-form" data-offline-capable>
          <div class="field">
            <span class="label">Who said it</span>
            <div class="seg">
              ${contacts.map(
                (c) => html`
                  <input type="radio" name="sourceContactId" id="c-${c.id}" value="${c.id}" />
                  <label for="c-${c.id}">${c.name.split(' ')[0]}</label>
                `,
              )}
            </div>
          </div>

          <div class="field">
            <span class="label">Area</span>
            ${segGroup('area', AREAS, 'OTHER')}
          </div>

          <div class="field">
            <span class="label">How</span>
            ${segGroup('channel', CHANNELS, 'TEXT')}
          </div>

          <div class="field">
            <label for="rawNote" class="label"
              >What was said <span class="req">— required</span></label
            >
            <textarea
              id="rawNote"
              name="rawNote"
              required
              autofocus
              placeholder="Dictate it. Their words, not yours."
            ></textarea>
            <p class="hint">
              This is never edited later. Your interpretation goes in the decision field
              at triage.
            </p>
          </div>

          <button class="btn btn-block" type="submit">Log it</button>
        </form>
      `),
    );
  });

  app.post('/capture', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = req.body as Record<string, string>;
    const rawNote = (body.rawNote || '').trim();
    if (!rawNote) return reply.redirect(302, '/capture');

    await createItem({
      rawNote,
      area: body.area,
      channel: body.channel,
      sourceContactId: body.sourceContactId,
      loggedById: user.id,
      clientId: body.clientId,
    });

    return reply.redirect(302, '/capture?saved=1');
  });

  /** JSON endpoint the service worker replays offline captures against. */
  app.post('/api/capture', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body as Record<string, string>;
    const rawNote = (body.rawNote || '').trim();
    if (!rawNote) return reply.code(400).send({ error: 'rawNote required' });

    const item = await createItem({
      rawNote,
      area: body.area,
      channel: body.channel,
      sourceContactId: body.sourceContactId,
      loggedById: user.id,
      clientId: body.clientId,
    });
    return reply.send({ ok: true, ref: item.ref });
  });

  // ------------------------------------------------------------ list
  app.get('/inbox', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const q = req.query as Record<string, string>;
    const status = STATUSES.find(([s]) => s === q.status)?.[0];

    const items = await prisma.inboxItem.findMany({
      where: status ? { status } : { status: { notIn: ['DONE'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: { sourceContact: true, products: { select: { sku: true } } },
    });

    const counts = await prisma.inboxItem.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

    return reply.type('text/html').send(
      layout({ title: status ? label(STATUSES, status) : 'Inbox', nav: 'triage', user }, html`
        <div class="seg" style="margin-bottom:var(--s3)">
          <a
            class="badge${!status ? ' badge-new' : ''}"
            href="/inbox"
            style="padding:.34rem .6rem"
            >Open</a
          >
          ${STATUSES.map(
            ([s, text]) => html`
              <a
                class="badge${status === s ? ' badge-new' : ''}"
                href="/inbox?status=${s}"
                style="padding:.34rem .6rem"
                >${text} ${countFor(s)}</a
              >
            `,
          )}
        </div>

        ${items.length === 0
          ? emptyState('Empty', 'Nothing here right now.')
          : itemList(items)}
      `),
    );
  });

  // ---------------------------------------------------------- triage
  app.get('/inbox/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const q = (req.query as any)?.q as string | undefined;

    const item = await prisma.inboxItem.findUnique({
      where: { id },
      include: {
        sourceContact: true,
        loggedBy: true,
        owner: true,
        products: true,
      },
    });
    if (!item) return reply.code(404).type('text/html').send(notFound(user));

    const [users, matches, siblings] = await Promise.all([
      prisma.user.findMany({ orderBy: { name: 'asc' } }),
      q && q.trim()
        ? prisma.product.findMany({
            where: {
              OR: [
                { sku: { contains: q, mode: 'insensitive' } },
                { flavor: { contains: q, mode: 'insensitive' } },
                { baseFlavor: { contains: q, mode: 'insensitive' } },
              ],
            },
            orderBy: { sku: 'asc' },
            take: 25,
          })
        : Promise.resolve([]),
      item.products.length
        ? prisma.product.findMany({
            where: {
              baseFlavor: { in: [...new Set(item.products.map((p) => p.baseFlavor))] },
              sku: { notIn: item.products.map((p) => p.sku) },
            },
            orderBy: { sku: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const linkedSkus = new Set(item.products.map((p) => p.sku));

    return reply.type('text/html').send(
      layout({ title: `INB-${String(item.ref).padStart(4, '0')}`, nav: 'triage', user }, html`
        <p class="eyebrow">
          ${item.sourceContact?.name ?? 'Unknown source'} ·
          ${label(CHANNELS, item.channel)} · ${relativeDay(item.createdAt)}
        </p>

        <div class="rawnote">
          <span class="rawnote-label">What was said — never edited</span>
          ${item.rawNote}
        </div>

        ${siblings.length
          ? html`
              <div class="flash flash-warn">
                <strong>${siblings.length} sibling SKU${siblings.length > 1 ? 's' : ''}</strong>
                share a flavour with what you linked:
                ${siblings.map((s) => html`<code>${s.sku}</code> `)}
                <form method="post" action="/inbox/${item.id}/link-siblings">
                  <button class="btn btn-sm btn-ghost" type="submit" style="margin-top:.5rem">
                    Link all ${siblings.length}
                  </button>
                </form>
              </div>
            `
          : raw('')}

        <form method="post" action="/inbox/${item.id}">
          <div class="field">
            <span class="label">Area</span>
            ${segGroup('area', AREAS, item.area)}
          </div>

          <div class="field">
            <label class="label" for="decision">Decision — your words</label>
            <textarea id="decision" name="decision" placeholder="What are we actually doing about it?">${item.decision ?? ''}</textarea>
          </div>

          <div class="field">
            <span class="label">Priority</span>
            ${segGroup('priority', PRIORITIES, item.priority)}
          </div>

          <div class="field">
            <label class="label" for="ownerId">Owner</label>
            <select id="ownerId" name="ownerId">
              <option value="">Unassigned</option>
              ${users.map(
                (u) => html`
                  <option value="${u.id}" ${u.id === item.ownerId ? raw('selected') : raw('')}>
                    ${u.name}
                  </option>
                `,
              )}
            </select>
          </div>

          <div class="field">
            <label class="label" for="dueDate">Due</label>
            <input
              id="dueDate"
              name="dueDate"
              type="date"
              value="${item.dueDate ? item.dueDate.toISOString().slice(0, 10) : ''}"
            />
          </div>

          <div class="field">
            <span class="label">Status</span>
            ${segGroup('status', STATUSES, item.status)}
          </div>

          <button class="btn btn-block" type="submit">Save</button>
        </form>

        <hr class="divider" />

        <h2>Linked SKUs</h2>
        ${item.products.length === 0
          ? html`<p class="lede">
              None yet. Danny says one flavour; it is often two or more SKUs.
            </p>`
          : html`
              <ul class="list">
                ${item.products.map(
                  (p) => html`
                    <li>
                      <div class="row" style="display:flex;justify-content:space-between;gap:var(--s2)">
                        <span><code>${p.sku}</code> ${p.flavor}</span>
                        <form method="post" action="/inbox/${item.id}/unlink">
                          <input type="hidden" name="sku" value="${p.sku}" />
                          <button class="btn btn-quiet btn-sm" type="submit">Remove</button>
                        </form>
                      </div>
                    </li>
                  `,
                )}
              </ul>
            `}

        <form method="get" action="/inbox/${item.id}">
          <div class="field">
            <label class="label" for="q">Find a SKU to link</label>
            <input
              id="q"
              name="q"
              type="search"
              value="${q ?? ''}"
              placeholder="blueberry, PSP-BM, double chocolate…"
            />
          </div>
        </form>

        ${matches.length
          ? html`
              <form method="post" action="/inbox/${item.id}/link">
                <ul class="list">
                  ${matches.map(
                    (p) => html`
                      <li>
                        <label class="row" style="display:flex;gap:var(--s2);align-items:baseline">
                          <input
                            type="checkbox"
                            name="sku"
                            value="${p.sku}"
                            ${linkedSkus.has(p.sku) ? raw('checked disabled') : raw('')}
                            style="width:auto"
                          />
                          <span><code>${p.sku}</code> ${p.flavor}</span>
                        </label>
                      </li>
                    `,
                  )}
                </ul>
                <button class="btn btn-block" type="submit">Link selected</button>
              </form>
            `
          : q
            ? html`<p class="lede">No SKU matches “${q}”.</p>`
            : raw('')}
      `),
    );
  });

  app.post('/inbox/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, string>;

    const status = (STATUSES.find(([s]) => s === b.status)?.[0] ?? 'NEW') as InboxStatus;
    const existing = await prisma.inboxItem.findUnique({ where: { id } });
    if (!existing) return reply.code(404).type('text/html').send(notFound(user));

    await prisma.inboxItem.update({
      where: { id },
      data: {
        area: (AREAS.find(([a]) => a === b.area)?.[0] ?? existing.area) as InboxArea,
        decision: b.decision?.trim() || null,
        priority: (PRIORITIES.find(([p]) => p === b.priority)?.[0] ?? existing.priority) as Priority,
        ownerId: b.ownerId || null,
        dueDate: b.dueDate ? new Date(b.dueDate) : null,
        status,
        triagedAt:
          existing.status === 'NEW' && status !== 'NEW'
            ? new Date()
            : existing.triagedAt,
        closedAt: status === 'DONE' ? new Date() : null,
      },
    });

    return reply.redirect(302, status === 'DONE' ? '/inbox' : `/inbox/${id}`);
  });

  app.post('/inbox/:id/link', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const skus = asArray((req.body as any)?.sku);
    if (skus.length) {
      await prisma.inboxItem.update({
        where: { id },
        data: { products: { connect: skus.map((sku) => ({ sku })) } },
      });
    }
    return reply.redirect(302, `/inbox/${id}`);
  });

  app.post('/inbox/:id/link-siblings', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const item = await prisma.inboxItem.findUnique({
      where: { id },
      include: { products: true },
    });
    if (!item) return reply.redirect(302, '/inbox');

    const siblings = await prisma.product.findMany({
      where: {
        baseFlavor: { in: [...new Set(item.products.map((p) => p.baseFlavor))] },
        sku: { notIn: item.products.map((p) => p.sku) },
      },
      select: { sku: true },
    });
    if (siblings.length) {
      await prisma.inboxItem.update({
        where: { id },
        data: { products: { connect: siblings.map((s) => ({ sku: s.sku })) } },
      });
    }
    return reply.redirect(302, `/inbox/${id}`);
  });

  app.post('/inbox/:id/unlink', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const sku = (req.body as any)?.sku;
    if (sku) {
      await prisma.inboxItem.update({
        where: { id },
        data: { products: { disconnect: { sku } } },
      });
    }
    return reply.redirect(302, `/inbox/${id}`);
  });
}

// -------------------------------------------------------------- helpers

async function createItem(input: {
  rawNote: string;
  area?: string;
  channel?: string;
  sourceContactId?: string;
  loggedById: string;
  clientId?: string;
}) {
  const area = (AREAS.find(([a]) => a === input.area)?.[0] ?? 'OTHER') as InboxArea;
  const channel = (CHANNELS.find(([c]) => c === input.channel)?.[0] ?? 'TEXT') as InboxChannel;

  // clientId makes an offline capture replayed twice a no-op rather than a duplicate.
  if (input.clientId) {
    const existing = await prisma.inboxItem.findUnique({ where: { clientId: input.clientId } });
    if (existing) return existing;
  }

  return prisma.inboxItem.create({
    data: {
      rawNote: input.rawNote,
      area,
      channel,
      sourceContactId: input.sourceContactId || null,
      loggedById: input.loggedById,
      clientId: input.clientId || null,
    },
  });
}

function itemList(
  items: Array<{
    id: string;
    ref: number;
    rawNote: string;
    status: InboxStatus;
    priority: Priority;
    area: InboxArea;
    createdAt: Date;
    dueDate: Date | null;
    sourceContact: { name: string } | null;
    products: Array<{ sku: string }>;
  }>,
): Html {
  return html`
    <ul class="list">
      ${items.map(
        (i) => html`
          <li>
            <a class="row" href="/inbox/${i.id}">
              <span class="row-top">
                <span class="${badgeClass(i.status, i.priority)}">${label(STATUSES, i.status)}</span>
                <span class="row-ref">INB-${String(i.ref).padStart(4, '0')}</span>
              </span>
              <p class="row-note">${i.rawNote}</p>
              <span class="row-meta">
                <span>${i.sourceContact?.name ?? 'unknown'}</span>
                <span>${label(AREAS, i.area)}</span>
                ${i.products.length
                  ? html`<span>${i.products.map((p) => p.sku).join(', ')}</span>`
                  : raw('')}
                <span>${relativeDay(i.createdAt)}</span>
                ${i.dueDate && i.dueDate < new Date() && i.status !== 'DONE'
                  ? html`<span style="color:var(--crit)">overdue</span>`
                  : raw('')}
              </span>
            </a>
          </li>
        `,
      )}
    </ul>
  `;
}

function asArray(v: unknown): string[] {
  if (!v) return [];
  return Array.isArray(v) ? (v as string[]) : [v as string];
}

function notFound(user: { name: string; role: string }) {
  return layout({ title: 'Not found', nav: 'triage', user }, html`
    <h1>Not found</h1>
    <p class="lede">That item does not exist, or it was deleted.</p>
    <a class="btn btn-ghost" href="/inbox">Back to inbox</a>
  `);
}
