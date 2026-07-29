import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { requireUser } from '../auth';
import { html, raw } from '../lib/html';
import { layout, emptyState } from '../views/layout';

/** GS1 check digit, same rule the audit script enforces. */
export function gtinValid(gtin: string | null): boolean {
  if (!gtin || !/^\d+$/.test(gtin)) return false;
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  const body = gtin.slice(0, -1);
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    total += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (total % 10)) % 10 === Number(gtin[gtin.length - 1]);
}

export function registerProductRoutes(app: FastifyInstance) {
  app.get('/products', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const q = ((req.query as any)?.q ?? '').toString().trim();
    const line = ((req.query as any)?.line ?? '').toString();

    const products = await prisma.product.findMany({
      where: {
        ...(line ? { productLine: line } : {}),
        ...(q
          ? {
              OR: [
                { sku: { contains: q, mode: 'insensitive' as const } },
                { flavor: { contains: q, mode: 'insensitive' as const } },
                { gtin: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ productLine: 'asc' }, { flavor: 'asc' }],
      take: 200,
    });

    const lines = await prisma.product.groupBy({
      by: ['productLine'],
      _count: { _all: true },
      orderBy: { productLine: 'asc' },
    });

    return reply.type('text/html').send(
      layout({ title: 'SKUs', nav: 'catalog', user }, html`
        <form method="get" action="/products">
          <div class="field">
            <input
              name="q"
              type="search"
              value="${q}"
              placeholder="Search SKU, flavour or GTIN"
            />
          </div>
        </form>

        <div class="seg" style="margin-bottom:var(--s3)">
          <a class="badge${!line ? ' badge-new' : ''}" href="/products" style="padding:.34rem .6rem"
            >All</a
          >
          ${lines.map(
            (l) => html`
              <a
                class="badge${line === l.productLine ? ' badge-new' : ''}"
                href="/products?line=${encodeURIComponent(l.productLine)}"
                style="padding:.34rem .6rem"
                >${l.productLine} ${l._count._all}</a
              >
            `,
          )}
        </div>

        ${products.length === 0
          ? emptyState('No SKUs match', 'Try a different search.')
          : html`
              <ul class="list">
                ${products.map(
                  (p) => html`
                    <li>
                      <a class="row" href="/products/${encodeURIComponent(p.sku)}">
                        <span class="row-top">
                          <span class="badge${p.status === 'ACTIVE' ? ' badge-ok' : ''}"
                            >${p.status.replace('_', ' ')}</span
                          >
                          <span class="row-ref">${p.sku}</span>
                          ${p.dataQualityFlag
                            ? html`<span class="badge badge-high">check</span>`
                            : raw('')}
                        </span>
                        <p class="row-note">${p.flavor}</p>
                        <span class="row-meta">
                          <span>${p.gtin ?? 'no gtin'}</span>
                          <span>${p.format}</span>
                          <span>${p.specId ?? 'no spec'}</span>
                        </span>
                      </a>
                    </li>
                  `,
                )}
              </ul>
            `}
      `),
    );
  });

  app.get('/products/:sku', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { sku } = req.params as { sku: string };

    const product = await prisma.product.findUnique({
      where: { sku: decodeURIComponent(sku) },
      include: {
        spec: true,
        colors: { orderBy: { slot: 'asc' } },
        artworkVersions: { orderBy: { version: 'desc' } },
        poLines: { include: { po: true }, orderBy: { id: 'desc' } },
        inboxItems: { where: { status: { notIn: ['DONE'] } }, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!product) {
      return reply.code(404).type('text/html').send(
        layout({ title: 'Not found', nav: 'catalog', user }, html`
          <h1>No such SKU</h1>
          <a class="btn btn-ghost" href="/products">Back</a>
        `),
      );
    }

    const siblings = await prisma.product.findMany({
      where: { baseFlavor: product.baseFlavor, sku: { not: product.sku } },
      orderBy: { sku: 'asc' },
    });

    const onOrder = product.poLines.filter(
      (l) => !l.excluded && l.lineStatus !== 'CANCELLED',
    );
    const totalOnOrder = onOrder.reduce((n, l) => n + l.qty, 0);

    return reply.type('text/html').send(
      layout({ title: product.sku, nav: 'catalog', user }, html`
        <p class="eyebrow">${product.productLine} · ${product.format}</p>
        <h1>${product.flavor}</h1>

        <div class="stat-row">
          <div class="stat ${gtinValid(product.gtin) ? 'stat-ok' : 'stat-crit'}">
            <b style="font-size:.95rem">${product.gtin ?? '—'}</b>
            <span>${gtinValid(product.gtin) ? 'GTIN valid' : 'GTIN check failed'}</span>
          </div>
          <div class="stat ${totalOnOrder > 0 ? 'stat-accent' : ''}">
            <b>${totalOnOrder.toLocaleString()}</b><span>On order</span>
          </div>
        </div>

        ${product.inboxItems.length
          ? html`
              <div class="flash flash-warn">
                <strong>${product.inboxItems.length} open change${
                  product.inboxItems.length > 1 ? 's' : ''
                }</strong>
                ${product.inboxItems.map(
                  (i) => html`<br /><a href="/inbox/${i.id}">INB-${String(i.ref).padStart(4, '0')}</a>
                    — ${i.rawNote.slice(0, 90)}`,
                )}
              </div>
            `
          : raw('')}

        <h2>Identity</h2>
        <ul class="list">
          ${row('SKU', product.sku)} ${row('Legacy SKU', product.legacySku)}
          ${row('Base flavour', product.baseFlavor)} ${row('Status', product.status)}
          ${row('Shopify SKU', product.shopifySku)}
          ${row('Shopify variant', product.shopifyVariantId)}
          ${row('MRP formula', product.mrpFormulaId)} ${row('Formula rev', product.formulaRev)}
          ${row('Eyemark', product.eyemarkColor)}
        </ul>

        ${siblings.length
          ? html`
              <h2>Same flavour, other SKUs</h2>
              <p class="lede">
                A change to this flavour probably touches these too.
              </p>
              <ul class="list">
                ${siblings.map(
                  (s) => html`
                    <li>
                      <a class="row" href="/products/${encodeURIComponent(s.sku)}">
                        <span class="row-top"><span class="row-ref">${s.sku}</span></span>
                        <p class="row-note">${s.flavor}</p>
                      </a>
                    </li>
                  `,
                )}
              </ul>
            `
          : raw('')}

        ${product.spec
          ? html`
              <h2>Packaging spec</h2>
              <ul class="list">
                ${row('Spec', product.spec.specId)} ${row('Name', product.spec.name)}
                ${row('Material', product.spec.materialStructure)}
                ${row('Zipper', product.spec.zipper)}
                ${row('Print', product.spec.printProcess)}
                ${row(
                  'Trim',
                  product.spec.trimLengthMm
                    ? `${product.spec.trimLengthMm} × ${product.spec.trimWidthMm} mm`
                    : null,
                )}
                ${row('Gusset', product.spec.gussetMm ? `${product.spec.gussetMm} mm` : null)}
                ${row('Wind', product.spec.windDirection)}
              </ul>
            `
          : html`<h2>Packaging spec</h2>
              <p class="lede">None linked — this is one of the 29 SKUs with no recorded spec.</p>`}

        ${product.colors.length
          ? html`
              <h2>Colours</h2>
              <ul class="list">
                ${product.colors.map(
                  (c) => html`
                    <li>
                      <div class="row" style="display:flex;align-items:center;gap:var(--s2)">
                        <span
                          style="width:1.4rem;height:1.4rem;border-radius:3px;border:1px solid var(--rule);flex:none;background:${
                            c.hexValid ? '#' + (c.hex ?? '').replace(/^(HEX|HX)\s+/, '') : 'transparent'
                          }"
                        ></span>
                        <span class="m">${c.pms ?? '—'}</span>
                        <span class="m" style="color:${c.hexValid ? 'var(--muted)' : 'var(--crit)'}"
                          >${c.hex ?? '—'}${c.hexValid ? '' : ' ✕'}</span
                        >
                      </div>
                    </li>
                  `,
                )}
              </ul>
            `
          : raw('')}

        ${product.poLines.length
          ? html`
              <h2>Purchase history</h2>
              <ul class="list">
                ${product.poLines.map(
                  (l) => html`
                    <li>
                      <a class="row" href="/pos/${l.poId}">
                        <span class="row-top">
                          <span class="badge${l.excluded ? '' : ' badge-ok'}"
                            >${l.excluded ? 'excluded' : l.lineStatus.replace(/_/g, ' ')}</span
                          >
                          <span class="row-ref">PO ${l.po.poNumber ?? 'draft'}</span>
                        </span>
                        <span class="row-meta">
                          <span>${l.qty.toLocaleString()} u</span>
                          <span>$${Number(l.unitCost).toFixed(4)}/u</span>
                          <span
                            >$${(Number(l.unitCost) * l.qty).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}</span
                          >
                          ${l.promisedDate
                            ? html`<span>promised ${l.promisedDate.toISOString().slice(0, 10)}</span>`
                            : raw('')}
                        </span>
                      </a>
                    </li>
                  `,
                )}
              </ul>
            `
          : raw('')}
      `),
    );
  });
}

function row(label: string, value: string | null | undefined) {
  if (!value) return raw('');
  return html`
    <li>
      <div class="row" style="display:flex;justify-content:space-between;gap:var(--s2)">
        <span class="row-meta" style="margin:0">${label}</span>
        <span class="m" style="text-align:right">${value}</span>
      </div>
    </li>
  `;
}
