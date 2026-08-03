import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { requireUser } from '../auth';
import { html, raw } from '../lib/html';
import { layout, emptyState } from '../views/layout';
import { tip } from '../views/tips';
import { renderPoPdf, poNumberForDate } from '../lib/po-pdf';
import { LOGO_KEY } from './settings';

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function registerPoRoutes(app: FastifyInstance) {
  app.get('/pos', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const pos = await prisma.purchaseOrder.findMany({
      orderBy: [{ poDate: 'desc' }, { createdAt: 'desc' }],
      include: { vendor: true, lines: true },
    });

    return reply.type('text/html').send(
      layout({ title: 'Purchase orders', nav: 'pos', user }, html`
        ${tip({
          key: 'orders-v1',
          title: 'Excluded lines stay visible but leave the total',
          body: html`<p>
            Open a PO and tap <strong>Download PDF</strong> to get the document you
            send to Mike. Lines marked excluded print struck through and are not
            counted — the fix for the $24,850 your spreadsheets were overstating.
          </p>`,
        })}
        ${pos.length === 0
          ? emptyState('No purchase orders', 'Imported POs will appear here.')
          : html`
              <ul class="list">
                ${pos.map((po) => {
                  const included = po.lines.filter((l) => !l.excluded);
                  const excluded = po.lines.filter((l) => l.excluded);
                  const total = included.reduce(
                    (n, l) => n + Number(l.unitCost) * l.qty,
                    0,
                  );
                  const excludedTotal = excluded.reduce(
                    (n, l) => n + Number(l.unitCost) * l.qty,
                    0,
                  );
                  return html`
                    <li>
                      <a class="row" href="/pos/${po.id}">
                        <span class="row-top">
                          <span class="badge">${po.status.replace(/_/g, ' ')}</span>
                          <span class="row-ref">PO ${po.poNumber ?? 'draft'}</span>
                        </span>
                        <p class="row-note">${po.category ?? po.vendor.name}</p>
                        <span class="row-meta">
                          <span>${included.length} lines</span>
                          <span>${money(total)}</span>
                          ${excluded.length
                            ? html`<span style="color:var(--crit)"
                                >${excluded.length} excluded · ${money(excludedTotal)} removed</span
                              >`
                            : raw('')}
                        </span>
                      </a>
                    </li>
                  `;
                })}
              </ul>
            `}
      `),
    );
  });

  app.get('/pos/:id', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: true,
        lines: { include: { product: true, spec: true }, orderBy: { lineNo: 'asc' } },
      },
    });
    if (!po) {
      return reply.code(404).type('text/html').send(
        layout({ title: 'Not found', nav: 'pos', user }, html`
          <h1>No such PO</h1><a class="btn btn-ghost" href="/pos">Back</a>
        `),
      );
    }

    const included = po.lines.filter((l) => !l.excluded);
    const excluded = po.lines.filter((l) => l.excluded);
    const total = included.reduce((n, l) => n + Number(l.unitCost) * l.qty, 0);
    const excludedTotal = excluded.reduce((n, l) => n + Number(l.unitCost) * l.qty, 0);
    const qty = included.reduce((n, l) => n + l.qty, 0);

    return reply.type('text/html').send(
      layout({ title: `PO ${po.poNumber ?? 'draft'}`, nav: 'pos', user }, html`
        <p class="eyebrow">${po.vendor.name} · ${po.category ?? ''}</p>

        <div class="stat-row">
          <div class="stat stat-accent"><b>${qty.toLocaleString()}</b><span>Units</span></div>
          <div class="stat stat-ok">
            <b style="font-size:1.15rem">${money(total)}</b><span>Total</span>
          </div>
        </div>

        ${excluded.length
          ? html`
              <div class="flash flash-err">
                <strong>${excluded.length} excluded line${excluded.length > 1 ? 's' : ''}</strong>
                — ${money(excludedTotal)} removed from the total. In the old spreadsheet this
                money stayed in.
              </div>
            `
          : raw('')}

        <div class="btn-row">
          <a class="btn" href="/pos/${po.id}/pdf">Download PDF</a>
        </div>

        <h2>Lines</h2>
        <ul class="list">
          ${po.lines.map(
            (l) => html`
              <li>
                <div class="row" style="${l.excluded ? 'opacity:.55' : ''}">
                  <span class="row-top">
                    <span class="badge${l.excluded ? ' badge-crit' : ''}"
                      >${l.excluded ? 'excluded' : l.lineStatus.replace(/_/g, ' ')}</span
                    >
                    <span class="row-ref">${l.sku ?? '—'}</span>
                  </span>
                  <p class="row-note" style="${l.excluded ? 'text-decoration:line-through' : ''}">
                    ${l.description} — ${l.product?.baseFlavor ?? l.sku ?? ''}
                  </p>
                  <span class="row-meta">
                    <span>${l.qty.toLocaleString()} u</span>
                    <span>$${Number(l.unitCost).toFixed(4)}</span>
                    <span>${money(Number(l.unitCost) * l.qty)}</span>
                    ${l.exclusionNote ? html`<span style="color:var(--crit)">${l.exclusionNote}</span>` : raw('')}
                  </span>
                </div>
              </li>
            `,
          )}
        </ul>
      `),
    );
  });

  app.get('/pos/:id/pdf', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };

    const [po, logo] = await Promise.all([
      prisma.purchaseOrder.findUnique({
        where: { id },
        include: {
          vendor: true,
          lines: { include: { product: true, spec: true }, orderBy: { lineNo: 'asc' } },
        },
      }),
      prisma.appAsset.findUnique({ where: { key: LOGO_KEY } }),
    ]);
    if (!po) return reply.code(404).send('Not found');

    const doc = renderPoPdf(po, {
      logo: logo ? { data: Buffer.from(logo.data), mimeType: logo.mimeType } : null,
      shipTo: po.shipTo ? po.shipTo.split('\n') : undefined,
    });

    const filename = `ProDough_PO_${po.poNumber ?? 'DRAFT'}_${(po.category ?? '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')}.pdf`;

    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`);

    doc.end();
    return reply.send(doc as any);
  });

  /** Assigns the MMDDYY number once, at send time. Never hand-typed. */
  app.post('/pos/:id/send', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) return reply.code(404).send('Not found');
    if (po.poNumber) return reply.redirect(302, `/pos/${id}`);

    const now = new Date();
    let candidate = poNumberForDate(now);
    let suffix = 0;
    // Same-day collisions get a letter suffix rather than a different date.
    while (await prisma.purchaseOrder.findUnique({ where: { poNumber: candidate } })) {
      candidate = poNumberForDate(now) + String.fromCharCode(65 + suffix++);
    }

    await prisma.purchaseOrder.update({
      where: { id },
      data: { poNumber: candidate, sentAt: now, poDate: now, status: 'SENT' },
    });
    return reply.redirect(302, `/pos/${id}`);
  });
}
