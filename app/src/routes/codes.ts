import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PackFormat, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireUser } from '../auth';
import { newToken } from '../lib/crypto';
import { html, raw, Html } from '../lib/html';
import { layout, emptyState, flash } from '../views/layout';
import { tip } from '../views/tips';
import { titleCase } from '../lib/query';
import { env } from '../env';
import {
  CatalogEntry,
  FAMILIES,
  Family,
  findFamily,
  gtinPools,
  gtinValid,
  suggestGtin,
  suggestSku,
} from '../lib/codes';

const FORMATS: PackFormat[] = ['POUCH', 'STICK', 'BOX', 'CUP'];

const CATALOG_SELECT = {
  sku: true,
  gtin: true,
  productLine: true,
  format: true,
  baseFlavor: true,
} satisfies Prisma.ProductSelect;

function loadCatalog(): Promise<CatalogEntry[]> {
  return prisma.product.findMany({ select: CATALOG_SELECT });
}

/** Absolute link to text to someone. PUBLIC_URL wins; the Host header is the fallback. */
function origin(req: FastifyRequest): string {
  if (env.publicUrl) return env.publicUrl;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  return `${req.protocol}://${host}`;
}

function refOf(ref: number) {
  return `NEW-${String(ref).padStart(4, '0')}`;
}

function taskState(r: { sku: string | null; gtin: string | null }) {
  return { skuDone: Boolean(r.sku), gtinDone: Boolean(r.gtin) };
}

export function registerCodeRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------ list
  app.get('/codes', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const q = req.query as Record<string, string>;

    const [open, done, catalog] = await Promise.all([
      prisma.codeRequest.findMany({
        where: { status: { in: ['OPEN', 'READY'] } },
        orderBy: { createdAt: 'asc' },
        include: { skuAssignee: true, gtinAssignee: true },
      }),
      prisma.codeRequest.findMany({
        where: { status: { in: ['CREATED', 'CANCELLED'] } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      loadCatalog(),
    ]);

    const pools = gtinPools(catalog);

    return reply.type('text/html').send(
      layout({ title: 'New codes', nav: 'catalog', user }, html`
        ${q.err ? flash('err', q.err) : raw('')}
        ${q.saved ? flash('ok', 'Saved.') : raw('')}

        ${tip({
          key: 'codes-v1',
          title: 'Two jobs, two people, one record',
          body: html`<p>
            Start a request and the app proposes both codes from the patterns already
            in the catalogue. Hand the SKU half to whoever names them — a share link
            works without an account — and keep the GS1 half. Nothing becomes a real
            product until both are agreed.
          </p>`,
        })}

        <div class="stat-row">
          ${pools.map(
            (p) => html`
              <div class="stat ${p.free <= 25 ? 'stat-crit' : 'stat-ok'}">
                <b>${p.free}</b><span>free · ${p.prefix}</span>
              </div>
            `,
          )}
        </div>

        <h2>Open requests</h2>
        ${open.length === 0
          ? emptyState('Nothing waiting', 'Start one below when a new flavour comes in.')
          : html`
              <ul class="list">
                ${open.map((r) => {
                  const { skuDone, gtinDone } = taskState(r);
                  return html`
                    <li>
                      <a class="row" href="/codes/${r.id}">
                        <span class="row-top">
                          <span class="badge${skuDone && gtinDone ? ' badge-ok' : ''}"
                            >${skuDone && gtinDone ? 'ready' : 'open'}</span
                          >
                          <span class="row-ref">${refOf(r.ref)}</span>
                        </span>
                        <p class="row-note">
                          ${r.baseFlavor} — ${r.productLine} ${titleCase(r.format)}
                        </p>
                        <span class="row-meta">
                          <span style="color:${skuDone ? 'var(--ok)' : 'var(--crit)'}"
                            >SKU ${skuDone ? r.sku : '—'}</span
                          >
                          <span style="color:${gtinDone ? 'var(--ok)' : 'var(--crit)'}"
                            >GTIN ${gtinDone ? r.gtin : '—'}</span
                          >
                          ${r.skuAssignee || r.skuAssigneeName
                            ? html`<span
                                >SKU with ${r.skuAssignee?.name ?? r.skuAssigneeName}</span
                              >`
                            : raw('')}
                        </span>
                      </a>
                    </li>
                  `;
                })}
              </ul>
            `}

        <hr class="divider" />
        <h2>Start a request</h2>
        <p class="lede">
          The flavour name is all that is needed — both codes are proposed from it.
        </p>
        ${newRequestForm()}

        ${done.length
          ? html`
              <hr class="divider" />
              <details class="panel">
                <summary>Closed (${done.length})</summary>
                <ul class="list">
                  ${done.map(
                    (r) => html`
                      <li>
                        <a class="row" href="/codes/${r.id}">
                          <span class="row-top">
                            <span class="badge">${r.status.toLowerCase()}</span>
                            <span class="row-ref">${r.sku ?? refOf(r.ref)}</span>
                          </span>
                          <p class="row-note">${r.baseFlavor} — ${r.productLine}</p>
                        </a>
                      </li>
                    `,
                  )}
                </ul>
              </details>
            `
          : raw('')}

        <hr class="divider" />
        <h2>The standard</h2>
        <p class="lede">
          Read off the 118 codes that already exist. Serial numbers are unique per
          prefix, not per product line — that is what stops a repeat of PP 21–24.
        </p>
        <div class="scroller">
          <table class="grid">
            <thead>
              <tr><th>Line</th><th>Format</th><th>Prefix</th><th>Serial</th></tr>
            </thead>
            <tbody>
              ${FAMILIES.map(
                (f) => html`
                  <tr>
                    <td class="sticky-col">${f.line}</td>
                    <td>${titleCase(f.format)}</td>
                    <td><code>${f.prefix}-</code></td>
                    <td>${f.sequenced ? 'yes' : 'no'}${f.note ? html` · ${f.note}` : raw('')}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      `),
    );
  });

  // ---------------------------------------------------------------- create
  app.post('/codes', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const b = req.body as Record<string, string>;

    const productLine = (b.productLine || '').trim();
    const format = (FORMATS.includes(b.format as PackFormat) ? b.format : 'POUCH') as PackFormat;
    const baseFlavor = (b.baseFlavor || '').trim();
    if (!productLine || !baseFlavor) {
      return reply.redirect(302, '/codes?err=Pick+a+line+and+name+the+flavour');
    }

    const catalog = await loadCatalog();
    const sku = suggestSku({ productLine, format, baseFlavor }, catalog);
    const gtin = suggestGtin(productLine, catalog);

    const created = await prisma.codeRequest.create({
      data: {
        productLine,
        format,
        baseFlavor,
        flavor: (b.flavor || '').trim() || null,
        notes: (b.notes || '').trim() || null,
        suggestedSku: sku.value,
        skuBasis: sku.basis,
        suggestedGtin: gtin.value,
        gtinBasis: gtin.basis,
        createdById: user.id,
        inboxItemId: (b.inboxItemId || '').trim() || null,
      },
    });
    return reply.redirect(302, `/codes/${created.id}`);
  });

  // ---------------------------------------------------------------- detail
  app.get('/codes/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, string>;

    const r = await prisma.codeRequest.findUnique({
      where: { id },
      include: { skuAssignee: true, gtinAssignee: true, createdBy: true, inboxItem: true },
    });
    if (!r) return reply.callNotFound();

    const [catalog, users] = await Promise.all([
      loadCatalog(),
      prisma.user.findMany({ orderBy: { name: 'asc' } }),
    ]);

    // Recomputed on every view rather than read from the row: the suggestion
    // has to reflect what has been allocated since the request was raised.
    const skuNow = suggestSku(
      { productLine: r.productLine, format: r.format, baseFlavor: r.baseFlavor },
      catalog,
    );
    const gtinNow = suggestGtin(r.productLine, catalog);
    const family = findFamily(r.productLine, r.format);
    const { skuDone, gtinDone } = taskState(r);
    const ready = skuDone && gtinDone;
    const shareUrl = r.shareToken ? `${origin(req)}/s/${r.shareToken}` : null;

    return reply.type('text/html').send(
      layout({ title: refOf(r.ref), nav: 'catalog', user }, html`
        ${q.err ? flash('err', q.err) : raw('')}
        <p class="eyebrow">${r.productLine} · ${titleCase(r.format)} · ${r.status.toLowerCase()}</p>
        <h1>${r.baseFlavor}</h1>
        ${r.notes ? html`<p class="lede">${r.notes}</p>` : raw('')}
        ${r.inboxItem
          ? html`<p class="lede">
              From <a href="/inbox/${r.inboxItem.id}"
                >INB-${String(r.inboxItem.ref).padStart(4, '0')}</a
              >
            </p>`
          : raw('')}

        <div class="stat-row">
          <div class="stat ${skuDone ? 'stat-ok' : 'stat-crit'}">
            <b style="font-size:.95rem">${r.sku ?? '—'}</b><span>SKU</span>
          </div>
          <div class="stat ${gtinDone ? 'stat-ok' : 'stat-crit'}">
            <b style="font-size:.95rem">${r.gtin ?? '—'}</b><span>GTIN</span>
          </div>
        </div>

        ${r.status === 'CREATED' && r.productSku
          ? html`
              <div class="flash flash-ok">
                Added to the catalogue as
                <a href="/products/${encodeURIComponent(r.productSku)}"
                  ><code>${r.productSku}</code></a
                >.
              </div>
            `
          : raw('')}

        <!-- ------------------------------------------------------- SKU -->
        <hr class="divider" />
        <h2>SKU${skuDone ? ' ✓' : ''}</h2>
        ${skuDone
          ? html`
              <p class="lede">
                <code>${r.sku}</code> — set ${r.skuSetBy ? `by ${r.skuSetBy}` : ''}
                ${r.skuSetAt ? `on ${r.skuSetAt.toISOString().slice(0, 10)}` : ''}.
                ${r.sku !== r.suggestedSku && r.suggestedSku
                  ? html`Overrode the suggested <code>${r.suggestedSku}</code>.`
                  : raw('')}
              </p>
              <form method="post" action="/codes/${r.id}/sku">
                <input type="hidden" name="clear" value="1" />
                <button class="btn btn-ghost btn-sm" type="submit">Clear and redo</button>
              </form>
            `
          : html`
              ${suggestionBlock('Suggested', skuNow.value, skuNow.basis, skuNow.warnings)}
              <form method="post" action="/codes/${r.id}/sku">
                <div class="field">
                  <label class="label" for="sku">SKU</label>
                  <input
                    id="sku"
                    name="sku"
                    type="text"
                    value="${skuNow.value ?? ''}"
                    autocapitalize="characters"
                    spellcheck="false"
                    required
                  />
                  <p class="hint">
                    ${family
                      ? `Prefix ${family.prefix}- is the standard for this line and format.`
                      : 'No prefix defined for this line and format yet.'}
                  </p>
                </div>
                ${skuNow.alternates.length
                  ? html`
                      <p class="label">Or one of these</p>
                      <div class="chiprow">
                        ${skuNow.alternates.map(
                          (a) => html`<button
                            class="fchip"
                            type="submit"
                            name="sku"
                            value="${a}"
                          >
                            ${a}
                          </button>`,
                        )}
                      </div>
                    `
                  : raw('')}
                <button class="btn" type="submit">Set the SKU</button>
              </form>

              <p class="label" style="margin-top:var(--s3)">Hand this off</p>
              ${assignForm(r.id, 'sku', users, r.skuAssigneeUserId, r.skuAssigneeName)}
            `}

        <!-- ------------------------------------------------------ GTIN -->
        <hr class="divider" />
        <h2>GS1 barcode${gtinDone ? ' ✓' : ''}</h2>
        ${gtinDone
          ? html`
              <p class="lede">
                <code>${r.gtin}</code> —
                ${gtinValid(r.gtin) ? 'check digit verifies' : 'CHECK DIGIT FAILS'}.
                ${r.gtinSetBy ? `Set by ${r.gtinSetBy}.` : ''}
              </p>
              <form method="post" action="/codes/${r.id}/gtin">
                <input type="hidden" name="clear" value="1" />
                <button class="btn btn-ghost btn-sm" type="submit">Clear and redo</button>
              </form>
            `
          : html`
              ${suggestionBlock('Next free number', gtinNow.value, gtinNow.basis, gtinNow.warnings)}
              <form method="post" action="/codes/${r.id}/gtin">
                <div class="field">
                  <label class="label" for="gtin">GTIN-12</label>
                  <input
                    id="gtin"
                    name="gtin"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]{12,14}"
                    value="${gtinNow.value ?? ''}"
                    required
                  />
                  <p class="hint">The check digit is verified before it is accepted.</p>
                </div>
                ${gtinNow.alternates.length
                  ? html`
                      <p class="label">Skip to</p>
                      <div class="chiprow">
                        ${gtinNow.alternates.map(
                          (a) => html`<button class="fchip" type="submit" name="gtin" value="${a}">
                            ${a}
                          </button>`,
                        )}
                      </div>
                    `
                  : raw('')}
                <button class="btn" type="submit">Allocate this number</button>
              </form>

              <details class="panel">
                <summary>Prefix capacity</summary>
                <ul class="list">
                  ${gtinNow.pools.map(
                    (p) => html`
                      <li>
                        <div class="row">
                          <span class="row-top"><span class="row-ref">${p.prefix}</span></span>
                          <p class="row-note">${p.lines.join(', ')}</p>
                          <span class="row-meta">
                            <span>${p.used} used</span>
                            <span style="color:${p.free <= 25 ? 'var(--crit)' : 'var(--muted)'}"
                              >${p.free} free</span
                            >
                          </span>
                        </div>
                      </li>
                    `,
                  )}
                </ul>
              </details>

              <p class="label" style="margin-top:var(--s3)">Hand this off</p>
              ${assignForm(r.id, 'gtin', users, r.gtinAssigneeUserId, r.gtinAssigneeName)}
            `}

        <!-- ----------------------------------------------------- share -->
        <hr class="divider" />
        <h2>Share link</h2>
        <p class="lede">
          A link that works without an account, so whoever names the SKUs does not
          need one. It only opens the half you scope it to.
        </p>
        ${shareUrl
          ? html`
              <div class="card">
                <p class="m" style="word-break:break-all">${shareUrl}</p>
                <p class="hint">
                  Scope: ${r.shareScope.toLowerCase()} ·
                  ${r.shareExpiresAt
                    ? `expires ${r.shareExpiresAt.toISOString().slice(0, 10)}`
                    : 'no expiry'}
                  ${r.shareOpenedAt
                    ? ` · first opened ${r.shareOpenedAt.toISOString().slice(0, 16).replace('T', ' ')}`
                    : ' · not opened yet'}
                </p>
                <div class="btn-row">
                  <button class="btn btn-sm btn-ghost" type="button" data-copy="${shareUrl}">
                    Copy link
                  </button>
                  <a
                    class="btn btn-sm btn-ghost"
                    href="sms:?&body=${encodeURIComponent(
                      `New ProDough ${r.productLine} ${r.format.toLowerCase()} — ${r.baseFlavor}. Needs a SKU: ${shareUrl}`,
                    )}"
                    >Text it</a
                  >
                </div>
                <form method="post" action="/codes/${r.id}/share">
                  <input type="hidden" name="revoke" value="1" />
                  <button class="btn btn-sm btn-danger" type="submit">Revoke</button>
                </form>
              </div>
            `
          : html`
              <form method="post" action="/codes/${r.id}/share">
                <div class="field">
                  <span class="label">Let them set</span>
                  <div class="seg">
                    <input type="radio" name="scope" id="scope-SKU" value="SKU" checked /><label
                      for="scope-SKU"
                      >SKU</label
                    ><input type="radio" name="scope" id="scope-GTIN" value="GTIN" /><label
                      for="scope-GTIN"
                      >GTIN</label
                    ><input type="radio" name="scope" id="scope-BOTH" value="BOTH" /><label
                      for="scope-BOTH"
                      >Both</label
                    >
                  </div>
                </div>
                <div class="field">
                  <label class="label" for="days">Expires in</label>
                  <input id="days" name="days" type="number" min="1" max="90" value="14" />
                  <p class="hint">Days. The link stops working after that.</p>
                </div>
                <button class="btn btn-ghost" type="submit">Create the link</button>
              </form>
            `}

        <!-- ----------------------------------------------------- finish -->
        ${ready && r.status !== 'CREATED'
          ? html`
              <hr class="divider" />
              <h2>Add it to the catalogue</h2>
              <p class="lede">
                Creates the SKU row so it can be filtered, linked to an inbox item and
                put on a PO. The packaging spec can be attached afterwards.
              </p>
              <form method="post" action="/codes/${r.id}/create">
                <div class="field">
                  <label class="label" for="flavor">Full product name</label>
                  <input
                    id="flavor"
                    name="flavor"
                    type="text"
                    value="${r.flavor ?? `${r.baseFlavor} ${r.productLine} ${titleCase(r.format)}`}"
                    required
                  />
                </div>
                <button class="btn" type="submit">Create ${r.sku}</button>
              </form>
            `
          : raw('')}

        ${r.status === 'OPEN' || r.status === 'READY'
          ? html`
              <hr class="divider" />
              <form method="post" action="/codes/${r.id}/cancel">
                <button class="btn btn-ghost btn-sm" type="submit">Cancel this request</button>
              </form>
            `
          : raw('')}
      `),
    );
  });

  // ------------------------------------------------------------ set a SKU
  app.post('/codes/:id/sku', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, string>;

    if (b.clear) {
      await prisma.codeRequest.update({
        where: { id },
        data: { sku: null, skuSetAt: null, skuSetBy: null, status: 'OPEN' },
      });
      return reply.redirect(302, `/codes/${id}`);
    }

    const err = await applySku(id, b.sku, user.name);
    return reply.redirect(302, err ? `/codes/${id}?err=${encodeURIComponent(err)}` : `/codes/${id}`);
  });

  // ----------------------------------------------------------- set a GTIN
  app.post('/codes/:id/gtin', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, string>;

    if (b.clear) {
      await prisma.codeRequest.update({
        where: { id },
        data: { gtin: null, gtinSetAt: null, gtinSetBy: null, status: 'OPEN' },
      });
      return reply.redirect(302, `/codes/${id}`);
    }

    const err = await applyGtin(id, b.gtin, user.name);
    return reply.redirect(302, err ? `/codes/${id}?err=${encodeURIComponent(err)}` : `/codes/${id}`);
  });

  // ---------------------------------------------------------------- assign
  app.post('/codes/:id/assign', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, string>;
    const which = b.which === 'gtin' ? 'gtin' : 'sku';
    const userId = (b.userId || '').trim() || null;
    const name = (b.name || '').trim() || null;

    await prisma.codeRequest.update({
      where: { id },
      data:
        which === 'gtin'
          ? { gtinAssigneeUserId: userId, gtinAssigneeName: userId ? null : name }
          : { skuAssigneeUserId: userId, skuAssigneeName: userId ? null : name },
    });
    return reply.redirect(302, `/codes/${id}`);
  });

  // ----------------------------------------------------------- share link
  app.post('/codes/:id/share', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, string>;

    if (b.revoke) {
      await prisma.codeRequest.update({
        where: { id },
        data: { shareToken: null, shareExpiresAt: null, shareOpenedAt: null },
      });
      return reply.redirect(302, `/codes/${id}`);
    }

    const days = Math.min(90, Math.max(1, Number(b.days) || 14));
    const scope = b.scope === 'GTIN' ? 'GTIN' : b.scope === 'BOTH' ? 'BOTH' : 'SKU';
    await prisma.codeRequest.update({
      where: { id },
      data: {
        shareToken: newToken(24),
        shareScope: scope,
        shareExpiresAt: new Date(Date.now() + days * 864e5),
        shareOpenedAt: null,
      },
    });
    return reply.redirect(302, `/codes/${id}`);
  });

  // ------------------------------------------------------ make it a product
  app.post('/codes/:id/create', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const b = req.body as Record<string, string>;

    const r = await prisma.codeRequest.findUnique({ where: { id } });
    if (!r) return reply.callNotFound();
    if (!r.sku || !r.gtin) {
      return reply.redirect(302, `/codes/${id}?err=${encodeURIComponent('Both codes must be set first')}`);
    }
    const clash = await prisma.product.findUnique({ where: { sku: r.sku } });
    if (clash) {
      return reply.redirect(302, `/codes/${id}?err=${encodeURIComponent(`${r.sku} already exists`)}`);
    }

    await prisma.product.create({
      data: {
        sku: r.sku,
        gtin: r.gtin,
        gtinValid: gtinValid(r.gtin),
        productLine: r.productLine,
        format: r.format,
        flavor: (b.flavor || '').trim() || `${r.baseFlavor} ${r.productLine}`,
        baseFlavor: r.baseFlavor,
        status: 'IN_DEVELOPMENT',
        notes: r.notes,
      },
    });
    await prisma.codeRequest.update({
      where: { id },
      data: { status: 'CREATED', productSku: r.sku, flavor: (b.flavor || '').trim() || null },
    });
    return reply.redirect(302, `/products/${encodeURIComponent(r.sku)}`);
  });

  app.post('/codes/:id/cancel', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    await prisma.codeRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    return reply.redirect(302, '/codes');
  });

  // -------------------------------------------------------- the share page
  // No session. The token is the credential, the scope is the boundary.
  app.get('/s/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const q = req.query as Record<string, string>;
    const r = await prisma.codeRequest.findUnique({ where: { shareToken: token } });

    const bad = shareProblem(r);
    if (bad || !r) return reply.code(410).type('text/html').send(sharePage(bad ?? 'Link not found'));

    if (!r.shareOpenedAt) {
      await prisma.codeRequest.update({ where: { id: r.id }, data: { shareOpenedAt: new Date() } });
    }

    const catalog = await loadCatalog();
    const canSku = r.shareScope === 'SKU' || r.shareScope === 'BOTH';
    const canGtin = r.shareScope === 'GTIN' || r.shareScope === 'BOTH';
    const skuNow = suggestSku(
      { productLine: r.productLine, format: r.format, baseFlavor: r.baseFlavor },
      catalog,
    );
    const gtinNow = suggestGtin(r.productLine, catalog);
    const family = findFamily(r.productLine, r.format);

    const doneSku = Boolean(r.sku);
    const doneGtin = Boolean(r.gtin);
    const finished = (!canSku || doneSku) && (!canGtin || doneGtin);

    return reply.type('text/html').send(
      layout({ title: 'ProDough — new product code', bare: true }, html`
        ${q.err ? flash('err', q.err) : raw('')}
        <p class="eyebrow">ProDough · Powder Ops</p>
        <h1>${r.baseFlavor}</h1>
        <p class="lede">
          ${r.productLine} · ${titleCase(r.format)}${r.notes ? html` — ${r.notes}` : raw('')}
        </p>

        ${finished
          ? html`
              <div class="flash flash-ok">
                Thank you — that is recorded. You can close this page.
              </div>
              <ul class="list">
                ${doneSku ? html`<li><div class="row"><span class="row-ref">SKU</span><p class="row-note"><code>${r.sku}</code></p></div></li>` : raw('')}
                ${doneGtin ? html`<li><div class="row"><span class="row-ref">GTIN</span><p class="row-note"><code>${r.gtin}</code></p></div></li>` : raw('')}
              </ul>
            `
          : html`
              <div class="field">
                <label class="label" for="who">Your name</label>
                <input
                  id="who"
                  form="share-form"
                  name="who"
                  type="text"
                  placeholder="So the record says who set it"
                  required
                />
              </div>

              <form method="post" action="/s/${token}" id="share-form">
                ${canSku && !doneSku
                  ? html`
                      <h2>SKU</h2>
                      ${suggestionBlock('Suggested', skuNow.value, skuNow.basis, skuNow.warnings)}
                      <div class="field">
                        <label class="label" for="sku">Use this, or type your own</label>
                        <input
                          id="sku"
                          name="sku"
                          type="text"
                          value="${skuNow.value ?? ''}"
                          autocapitalize="characters"
                          spellcheck="false"
                          required
                        />
                        <p class="hint">
                          ${family
                            ? `${family.prefix}- is the standard prefix for this line and format.`
                            : 'No standard prefix for this line and format yet.'}
                        </p>
                      </div>
                    `
                  : raw('')}
                ${canGtin && !doneGtin
                  ? html`
                      <h2>GS1 barcode</h2>
                      ${suggestionBlock('Next free', gtinNow.value, gtinNow.basis, gtinNow.warnings)}
                      <div class="field">
                        <label class="label" for="gtin">GTIN-12</label>
                        <input
                          id="gtin"
                          name="gtin"
                          type="text"
                          inputmode="numeric"
                          value="${gtinNow.value ?? ''}"
                          required
                        />
                      </div>
                    `
                  : raw('')}
                <button class="btn btn-block" type="submit">Submit</button>
              </form>
            `}
      `),
    );
  });

  app.post('/s/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const b = req.body as Record<string, string>;
    const r = await prisma.codeRequest.findUnique({ where: { shareToken: token } });

    const bad = shareProblem(r);
    if (bad || !r) return reply.code(410).type('text/html').send(sharePage(bad ?? 'Link not found'));

    const who = (b.who || '').trim().slice(0, 60) || 'via share link';
    const canSku = r.shareScope === 'SKU' || r.shareScope === 'BOTH';
    const canGtin = r.shareScope === 'GTIN' || r.shareScope === 'BOTH';

    // Scope is enforced here, not in the form. A hand-crafted POST that carries
    // a gtin against a SKU-scoped link is ignored, not honoured.
    let err: string | null = null;
    if (canSku && !r.sku && b.sku) err = await applySku(r.id, b.sku, who);
    if (!err && canGtin && !r.gtin && b.gtin) err = await applyGtin(r.id, b.gtin, who);

    return reply.redirect(302, err ? `/s/${token}?err=${encodeURIComponent(err)}` : `/s/${token}`);
  });
}

// -------------------------------------------------------------- write paths
// Both entry points — the signed-in screen and the share link — go through
// these, so validation cannot be bypassed by using the other door.

async function applySku(id: string, value: string, by: string): Promise<string | null> {
  const sku = (value || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,24}$/.test(sku)) {
    return 'A SKU is letters, digits and hyphens, 3 to 24 characters.';
  }
  if (await prisma.product.findUnique({ where: { sku } })) {
    return `${sku} is already a product.`;
  }
  const other = await prisma.codeRequest.findFirst({ where: { sku, NOT: { id } } });
  if (other) return `${sku} is already claimed by NEW-${String(other.ref).padStart(4, '0')}.`;

  const row = await prisma.codeRequest.update({
    where: { id },
    data: { sku, skuSetAt: new Date(), skuSetBy: by },
  });
  await maybeReady(row.id);
  return null;
}

async function applyGtin(id: string, value: string, by: string): Promise<string | null> {
  const gtin = (value || '').trim();
  if (!/^\d{12,14}$/.test(gtin)) return 'A GTIN is 12 to 14 digits.';
  if (!gtinValid(gtin)) return `${gtin} fails its GS1 check digit.`;
  if (await prisma.product.findFirst({ where: { gtin } })) {
    return `${gtin} is already on a product.`;
  }
  const other = await prisma.codeRequest.findFirst({ where: { gtin, NOT: { id } } });
  if (other) return `${gtin} is already claimed by NEW-${String(other.ref).padStart(4, '0')}.`;

  const row = await prisma.codeRequest.update({
    where: { id },
    data: { gtin, gtinSetAt: new Date(), gtinSetBy: by },
  });
  await maybeReady(row.id);
  return null;
}

async function maybeReady(id: string) {
  const r = await prisma.codeRequest.findUnique({ where: { id } });
  if (r && r.sku && r.gtin && r.status === 'OPEN') {
    await prisma.codeRequest.update({ where: { id }, data: { status: 'READY' } });
  }
}

function shareProblem(r: { shareExpiresAt: Date | null; status: string } | null): string | null {
  if (!r) return 'That link is not valid.';
  if (r.status === 'CANCELLED') return 'That request was cancelled.';
  if (r.shareExpiresAt && r.shareExpiresAt < new Date()) return 'That link has expired.';
  return null;
}

// ---------------------------------------------------------------- rendering

function sharePage(message: string): string {
  return layout({ title: 'Link not available', bare: true }, html`
    <p class="eyebrow">ProDough · Powder Ops</p>
    <h1>Link not available</h1>
    <p class="lede">${message} Ask whoever sent it for a new one.</p>
  `);
}

/** The suggestion, why it was made, and anything that should stop you. */
function suggestionBlock(
  label: string,
  value: string | null,
  basis: string,
  warnings: string[],
): Html {
  return html`
    <div class="card">
      <p class="eyebrow">${label}</p>
      <p style="font-size:1.4rem;font-weight:650;letter-spacing:.02em;margin:.25rem 0">
        <code>${value ?? '—'}</code>
      </p>
      <p class="hint">${basis}</p>
      ${warnings.map((w) => html`<p class="flash flash-warn" style="margin-top:.5rem">${w}</p>`)}
    </div>
  `;
}

function assignForm(
  id: string,
  which: 'sku' | 'gtin',
  users: Array<{ id: string; name: string }>,
  currentUserId: string | null,
  currentName: string | null,
): Html {
  return html`
    <form method="post" action="/codes/${id}/assign">
      <input type="hidden" name="which" value="${which}" />
      <div class="field">
        <label class="label" for="${which}-owner">Someone with an account</label>
        <select id="${which}-owner" name="userId">
          <option value="">— nobody —</option>
          ${users.map(
            (u) => html`<option value="${u.id}" ${currentUserId === u.id ? raw('selected') : raw('')}>
              ${u.name}
            </option>`,
          )}
        </select>
      </div>
      <div class="field">
        <label class="label" for="${which}-name">Or just a name, for the record</label>
        <input
          id="${which}-name"
          name="name"
          type="text"
          value="${currentName ?? ''}"
          placeholder="Who you texted the link to"
        />
      </div>
      <button class="btn btn-ghost btn-sm" type="submit">Save who has it</button>
    </form>
  `;
}

function newRequestForm(inboxItemId?: string): Html {
  const lines = [...new Set(FAMILIES.map((f) => f.line))];
  return html`
    <form method="post" action="/codes">
      ${inboxItemId ? html`<input type="hidden" name="inboxItemId" value="${inboxItemId}" />` : raw('')}
      <div class="field">
        <label class="label" for="baseFlavor">Flavour</label>
        <input
          id="baseFlavor"
          name="baseFlavor"
          type="text"
          placeholder="Peanut Butter Cup"
          required
        />
        <p class="hint">The base flavour, not the full retail name.</p>
      </div>
      <div class="field">
        <label class="label" for="productLine">Product line</label>
        <select id="productLine" name="productLine" required>
          ${lines.map((l) => html`<option value="${l}">${l}</option>`)}
        </select>
      </div>
      <div class="field">
        <label class="label" for="format">Format</label>
        <select id="format" name="format" required>
          ${FORMATS.map((f) => html`<option value="${f}">${titleCase(f)}</option>`)}
        </select>
      </div>
      <div class="field">
        <label class="label" for="notes">Notes</label>
        <input id="notes" name="notes" type="text" placeholder="Who asked, and why" />
      </div>
      <button class="btn" type="submit">Suggest the codes</button>
    </form>
  `;
}

export { newRequestForm };
export type { Family };
