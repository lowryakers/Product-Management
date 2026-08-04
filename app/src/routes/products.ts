import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireUser } from '../auth';
import { html, raw, Html } from '../lib/html';
import { layout, emptyState, flash } from '../views/layout';
import { tip } from '../views/tips';
import {
  COLUMNS,
  DEFAULT_COLS,
  FLAGS,
  FORMATS,
  GROUPS,
  STATUSES,
  ViewState,
  activeFilterCount,
  buildOrderBy,
  buildWhere,
  parseView,
  serializeView,
  titleCase,
  toggleParam,
  withParam,
} from '../lib/query';

/** GS1 check digit, mirrored from scripts/audit_master.py. */
export function gtinValid(gtin: string | null): boolean {
  if (!gtin || !/^\d+$/.test(gtin)) return false;
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  const body = gtin.slice(0, -1);
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    total += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (total % 10)) % 10 === Number(gtin[gtin.length - 1]);
}

// `satisfies` keeps the literal shape (so Row infers precisely) while still
// type-checking against Prisma. `as const` would make the arrays readonly,
// which Prisma's generated types reject.
const ROW_INCLUDE = {
  _count: { select: { colors: true, artworkVersions: true } },
  poLines: { select: { qty: true, excluded: true, lineStatus: true } },
  inboxItems: { where: { status: { notIn: ['DONE'] } }, select: { id: true } },
} satisfies Prisma.ProductInclude;

type Row = Awaited<ReturnType<typeof fetchRows>>[number];

async function fetchRows(view: ViewState) {
  return prisma.product.findMany({
    where: buildWhere(view),
    orderBy: buildOrderBy(view),
    include: ROW_INCLUDE,
  });
}

function cellValue(row: Row, key: string): string {
  switch (key) {
    case 'onOrder': {
      const n = row.poLines
        .filter((l) => !l.excluded && l.lineStatus !== 'STOCKED' && l.lineStatus !== 'CANCELLED')
        .reduce((sum, l) => sum + l.qty, 0);
      return n ? n.toLocaleString('en-US') : '';
    }
    case 'colorCount':
      return row._count.colors ? String(row._count.colors) : '';
    case 'artworkCount':
      return row._count.artworkVersions ? String(row._count.artworkVersions) : '';
    case 'openChanges':
      return row.inboxItems.length ? String(row.inboxItems.length) : '';
    case 'status':
    case 'format':
      return titleCase(String((row as any)[key] ?? ''));
    default:
      return String((row as any)[key] ?? '');
  }
}

export function registerProductRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------- explorer
  app.get('/products', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const view = parseView(req.query as Record<string, unknown>);
    const qs = serializeView(view);

    const [rows, lineFacets, specFacets, savedViews, total] = await Promise.all([
      fetchRows(view),
      prisma.product.groupBy({ by: ['productLine'], _count: { _all: true }, orderBy: { productLine: 'asc' } }),
      prisma.packagingSpec.findMany({ orderBy: { specId: 'asc' }, select: { specId: true, name: true } }),
      prisma.savedView.findMany({
        where: { userId: user.id, table: 'products' },
        orderBy: [{ pinned: 'desc' }, { name: 'asc' }],
      }),
      prisma.product.count(),
    ]);

    const visible = COLUMNS.filter((c) => view.cols.includes(c.key));
    const nFilters = activeFilterCount(view);

    // grouping is applied after the query so the group key can be any column
    const groups: Array<{ key: string; rows: Row[] }> = [];
    if (view.group) {
      const map = new Map<string, Row[]>();
      for (const r of rows) {
        const k = String((r as any)[view.group] ?? '—');
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      }
      for (const [key, rs] of map) groups.push({ key, rows: rs });
    }

    const chip = (label: string, active: boolean, href: string, count?: number) => html`
      <a class="fchip${active ? ' is-on' : ''}" href="${href}"
        >${label}${count !== undefined ? html` <b>${count}</b>` : raw('')}</a
      >
    `;

    return reply.type('text/html').send(
      layout({ title: 'SKUs', nav: 'catalog', user }, html`
        ${(req.query as any)?.saved ? flash('ok', 'View saved.') : raw('')}
        ${tip({
          key: 'skus-v1',
          title: 'This is where you ask questions',
          body: html`<p>
            Open <strong>Filters</strong> and pick a condition — "No usable spec",
            "Has material on order", "Stick with no eyemark". They combine. If you
            find yourself running the same one twice, name it and hit
            <strong>Save</strong>.
          </p>`,
        })}

        <form method="get" action="/products" class="searchbar">
          ${view.line.map((x) => html`<input type="hidden" name="line" value="${x}" />`)}
          ${view.format.map((x) => html`<input type="hidden" name="format" value="${x}" />`)}
          ${view.status.map((x) => html`<input type="hidden" name="status" value="${x}" />`)}
          ${view.spec.map((x) => html`<input type="hidden" name="spec" value="${x}" />`)}
          ${view.flags.map((x) => html`<input type="hidden" name="flag" value="${x}" />`)}
          <input type="hidden" name="sort" value="${view.sort}" />
          <input type="hidden" name="dir" value="${view.dir}" />
          <input type="hidden" name="group" value="${view.group}" />
          <input type="hidden" name="cols" value="${view.cols.join(',')}" />
          <input
            name="q"
            type="search"
            value="${view.q}"
            placeholder="Search SKU, flavour, GTIN, Shopify SKU"
            aria-label="Search"
          />
        </form>

        ${savedViews.length
          ? html`
              <div class="chiprow">
                ${savedViews.map(
                  (sv) => html`<a class="fchip is-saved" href="/products?${sv.query}">${sv.name}</a>`,
                )}
              </div>
            `
          : raw('')}

        ${nFilters
          ? html`
              <div class="chiprow activefilters">
                ${view.q
                  ? html`<a class="fchip is-on" href="${withParam(view, { q: '' })}"
                      >“${view.q}” ✕</a
                    >`
                  : raw('')}
                ${view.flags.map((f) => {
                  const def = FLAGS.find((x) => x.key === f);
                  return html`<a class="fchip is-on" href="${toggleParam(view, 'flags', f)}"
                    >${def?.label ?? f} ✕</a
                  >`;
                })}
                ${view.line.map(
                  (x) => html`<a class="fchip is-on" href="${toggleParam(view, 'line', x)}"
                    >${x} ✕</a
                  >`,
                )}
                ${view.format.map(
                  (x) => html`<a class="fchip is-on" href="${toggleParam(view, 'format', x)}"
                    >${titleCase(x)} ✕</a
                  >`,
                )}
                ${view.status.map(
                  (x) => html`<a class="fchip is-on" href="${toggleParam(view, 'status', x)}"
                    >${titleCase(x)} ✕</a
                  >`,
                )}
                ${view.spec.map(
                  (x) => html`<a class="fchip is-on" href="${toggleParam(view, 'spec', x)}"
                    >${x} ✕</a
                  >`,
                )}
                <a class="fchip" href="/products">Clear all</a>
              </div>
            `
          : raw('')}

        <!-- Panel stays collapsed even when filters are on: on a phone an open
             panel pushes the results below the fold. Active filters are shown
             as removable chips above instead. -->
        <details class="panel">
          <summary>
            Filters${nFilters ? html` <span class="count-pill">${nFilters}</span>` : raw('')}
          </summary>

          <p class="label">Condition</p>
          <div class="chiprow">
            ${FLAGS.map((f) =>
              chip(f.label, view.flags.includes(f.key), toggleParam(view, 'flags', f.key)),
            )}
          </div>

          <p class="label">Product line</p>
          <div class="chiprow">
            ${lineFacets.map((l) =>
              chip(
                l.productLine,
                view.line.includes(l.productLine),
                toggleParam(view, 'line', l.productLine),
                l._count._all,
              ),
            )}
          </div>

          <p class="label">Format</p>
          <div class="chiprow">
            ${FORMATS.map((f) =>
              chip(titleCase(f), view.format.includes(f), toggleParam(view, 'format', f)),
            )}
          </div>

          <p class="label">Status</p>
          <div class="chiprow">
            ${STATUSES.map((s) =>
              chip(titleCase(s), view.status.includes(s), toggleParam(view, 'status', s)),
            )}
          </div>

          <p class="label">Packaging spec</p>
          <div class="chiprow">
            ${specFacets.map((s) =>
              chip(s.specId, view.spec.includes(s.specId), toggleParam(view, 'spec', s.specId)),
            )}
          </div>

          <p class="label">Group by</p>
          <div class="chiprow">
            ${GROUPS.map((g) =>
              chip(g.label, view.group === g.key, withParam(view, { group: g.key })),
            )}
          </div>

          <p class="label">Columns</p>
          <div class="chiprow">
            ${COLUMNS.map((c) =>
              chip(c.label, view.cols.includes(c.key), toggleParam(view, 'cols', c.key)),
            )}
          </div>

          <div class="btn-row" style="margin-top:var(--s3)">
            <a class="btn btn-ghost btn-sm" href="/products">Reset</a>
            <a class="btn btn-ghost btn-sm" href="/products.csv${qs ? '?' + qs : ''}">Export CSV</a>
          </div>
        </details>

        <div class="resultbar">
          <span
            ><b>${rows.length}</b> of ${total}${nFilters ? ' · filtered' : ''}
            · <a href="/codes">new codes</a></span
          >
          ${!isBlank(qs)
            ? html`
                <form method="post" action="/views" class="saveform">
                  <input type="hidden" name="query" value="${qs}" />
                  <input name="name" type="text" placeholder="Name this view" required maxlength="40" />
                  <button class="btn btn-sm btn-ghost" type="submit">Save</button>
                </form>
              `
            : raw('')}
        </div>

        ${rows.length === 0
          ? emptyState(
              'Nothing matches',
              'Loosen a filter, or reset the view.',
              html`<a class="btn btn-ghost" href="/products">Reset</a>`,
            )
          : view.group
            ? html`${groups.map(
                (g) => html`
                  <h2 class="grouphead">
                    ${g.key === '—' ? 'Not set' : titleCase(g.key)}
                    <span class="count-pill">${g.rows.length}</span>
                  </h2>
                  ${table(visible, g.rows, view)}
                `,
              )}`
            : table(visible, rows, view)}
      `),
    );
  });

  // ------------------------------------------------------------ csv export
  app.get('/products.csv', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const view = parseView(req.query as Record<string, unknown>);
    const rows = await fetchRows(view);
    const visible = COLUMNS.filter((c) => view.cols.includes(c.key));

    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = [visible.map((c) => esc(c.label)).join(',')];
    for (const r of rows) {
      lines.push(visible.map((c) => esc(cellValue(r, c.key).replace(/,/g, ''))).join(','));
    }

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="prodough-skus.csv"')
      .send(lines.join('\n'));
  });

  // ----------------------------------------------------------- saved views
  app.post('/views', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const b = req.body as Record<string, string>;
    const name = (b.name || '').trim().slice(0, 40);
    const query = (b.query || '').slice(0, 2000);
    if (!name) return reply.redirect(302, `/products?${query}`);

    await prisma.savedView.upsert({
      where: { userId_table_name: { userId: user.id, table: 'products', name } },
      update: { query },
      create: { userId: user.id, table: 'products', name, query },
    });
    return reply.redirect(302, `/products?${query}&saved=1`);
  });

  app.post('/views/:id/delete', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    await prisma.savedView.deleteMany({ where: { id, userId: user.id } });
    return reply.redirect(302, '/products');
  });

  // ---------------------------------------------------------------- detail
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
          <h1>No such SKU</h1><a class="btn btn-ghost" href="/products">Back</a>
        `),
      );
    }

    const siblings = await prisma.product.findMany({
      where: { baseFlavor: product.baseFlavor, sku: { not: product.sku } },
      orderBy: { sku: 'asc' },
    });

    const onOrder = product.poLines.filter((l) => !l.excluded && l.lineStatus !== 'CANCELLED');
    const totalOnOrder = onOrder.reduce((n, l) => n + l.qty, 0);

    return reply.type('text/html').send(
      layout({ title: product.sku, nav: 'catalog', user }, html`
        <p class="eyebrow">${product.productLine} · ${titleCase(product.format)}</p>
        <h1>${product.flavor}</h1>

        ${tip({
          key: 'sku-detail-v1',
          title: 'Check "On order" before approving any change',
          body: html`<p>
            If there is material already bought, changing the artwork means running it
            out or scrapping it. Scroll down for the other SKUs sharing this flavour —
            a change here probably touches those too.
          </p>`,
        })}
        <div class="stat-row">
          <div class="stat ${product.gtinValid ? 'stat-ok' : 'stat-crit'}">
            <b style="font-size:.95rem">${product.gtin ?? '—'}</b>
            <span>${product.gtinValid ? 'GTIN valid' : 'GTIN check failed'}</span>
          </div>
          <div class="stat ${totalOnOrder > 0 ? 'stat-accent' : ''}">
            <b>${totalOnOrder.toLocaleString()}</b><span>On order</span>
          </div>
        </div>

        ${product.inboxItems.length
          ? html`
              <div class="flash flash-warn">
                <strong
                  >${product.inboxItems.length} open
                  change${product.inboxItems.length > 1 ? 's' : ''}</strong
                >
                ${product.inboxItems.map(
                  (i) => html`<br /><a href="/inbox/${i.id}"
                      >INB-${String(i.ref).padStart(4, '0')}</a
                    >
                    — ${i.rawNote.slice(0, 90)}`,
                )}
              </div>
            `
          : raw('')}

        <h2>Identity</h2>
        <ul class="list">
          ${detailRow('SKU', product.sku)} ${detailRow('Legacy SKU', product.legacySku)}
          ${detailRow('Base flavour', product.baseFlavor)}
          ${detailRow('Status', titleCase(product.status))}
          ${detailRow('Shopify SKU', product.shopifySku)}
          ${detailRow('Shopify variant', product.shopifyVariantId)}
          ${detailRow('MRP formula', product.mrpFormulaId)}
          ${detailRow('Formula rev', product.formulaRev)}
          ${detailRow('Eyemark', product.eyemarkColor)}
        </ul>

        ${siblings.length
          ? html`
              <h2>Same flavour, other SKUs</h2>
              <p class="lede">A change to this flavour probably touches these too.</p>
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
                ${detailRow('Spec', product.spec.specId)} ${detailRow('Name', product.spec.name)}
                ${detailRow('Material', product.spec.materialStructure)}
                ${detailRow('Zipper', product.spec.zipper)}
                ${detailRow('Print', product.spec.printProcess)}
                ${detailRow(
                  'Trim',
                  product.spec.trimLengthMm
                    ? `${product.spec.trimLengthMm} × ${product.spec.trimWidthMm} mm`
                    : null,
                )}
                ${detailRow('Gusset', product.spec.gussetMm ? `${product.spec.gussetMm} mm` : null)}
                ${detailRow('Wind', product.spec.windDirection)}
              </ul>
            `
          : html`<h2>Packaging spec</h2>
              <p class="lede">
                None linked — one of the 29 SKUs with no recorded spec.
              </p>`}

        ${product.colors.length
          ? html`
              <h2>Colours</h2>
              <ul class="list">
                ${product.colors.map(
                  (c) => html`
                    <li>
                      <div class="row" style="display:flex;align-items:center;gap:var(--s2)">
                        <span
                          class="swatch"
                          style="background:${c.hexValid
                            ? '#' + (c.hex ?? '').replace(/^(HEX|HX)\s+/, '')
                            : 'transparent'}"
                        ></span>
                        <span class="m">${c.pms ?? '—'}</span>
                        <span
                          class="m"
                          style="color:${c.hexValid ? 'var(--muted)' : 'var(--crit)'}"
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
                            >${l.excluded ? 'excluded' : titleCase(l.lineStatus)}</span
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

// -------------------------------------------------------------- rendering

function table(cols: typeof COLUMNS, rows: Row[], view: ViewState): Html {
  return html`
    <div class="scroller">
      <table class="grid">
        <thead>
          <tr>
            ${cols.map((c) => {
              const sortable = Boolean(c.sortField);
              const active = view.sort === c.key;
              const nextDir = active && view.dir === 'asc' ? 'desc' : 'asc';
              const href = withParam(view, { sort: c.key, dir: nextDir as 'asc' | 'desc' });
              return html`
                <th class="${c.numeric ? 'num' : ''}${active ? ' is-sorted' : ''}">
                  ${sortable
                    ? html`<a href="${href}"
                        >${c.label}${active ? (view.dir === 'asc' ? ' ↑' : ' ↓') : ''}</a
                      >`
                    : html`${c.label}`}
                </th>
              `;
            })}
          </tr>
        </thead>
        <tbody>
          ${rows.map(
            (r) => html`
              <tr>
                ${cols.map((c, i) =>
                  i === 0
                    ? html`<td class="sticky-col">
                        <a href="/products/${encodeURIComponent(r.sku)}"
                          ><code>${cellValue(r, c.key)}</code></a
                        >
                      </td>`
                    : html`<td class="${c.numeric ? 'num' : ''}">
                        ${c.key === 'gtin'
                          ? html`<span class="${r.gtinValid ? '' : 'bad'}"
                              >${cellValue(r, c.key)}</span
                            >`
                          : cellValue(r, c.key)}
                      </td>`,
                )}
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function detailRow(label: string, value: string | null | undefined): Html {
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

function isBlank(s: string) {
  return !s || s.length === 0;
}
