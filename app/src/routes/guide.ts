import type { FastifyInstance } from 'fastify';
import { prisma } from '../db';
import { requireUser } from '../auth';
import { html, raw } from '../lib/html';
import { layout } from '../views/layout';

/**
 * The in-app manual. Deliberately written against live numbers rather than
 * placeholders — "31 SKUs have no usable spec" teaches more than "filter your
 * products", and it stays true because it is queried at render time.
 */
export function registerGuideRoutes(app: FastifyInstance) {
  app.get('/guide', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const [products, newItems, openItems, noSpec, onOrderAgg, pos] = await Promise.all([
      prisma.product.count(),
      prisma.inboxItem.count({ where: { status: 'NEW' } }),
      prisma.inboxItem.count({ where: { status: { notIn: ['DONE'] } } }),
      prisma.product.count({
        where: {
          OR: [
            { specId: null },
            { spec: { OR: [{ materialStructure: null }, { materialStructure: '' }] } },
          ],
        },
      }),
      prisma.pOLine.aggregate({
        _sum: { qty: true },
        where: { excluded: false, lineStatus: { notIn: ['STOCKED', 'CANCELLED'] } },
      }),
      prisma.purchaseOrder.count(),
    ]);

    const onOrder = onOrderAgg._sum.qty ?? 0;

    return reply.type('text/html').send(
      layout({ title: 'How this works', nav: 'guide', user }, html`
        <p class="eyebrow">The whole system in one page</p>
        <h1>Two habits. Everything else is plumbing.</h1>

        <div class="rule-card">
          <p class="rule-n">1</p>
          <div>
            <p class="rule-t">Capture the moment it is said</p>
            <p class="rule-b">
              Danny mentions something in passing. You tap <strong>Capture</strong>,
              dictate what he said, done. Ten seconds, no thinking, no categorising.
              You are still standing in the hallway.
            </p>
          </div>
        </div>

        <div class="rule-card">
          <p class="rule-n">2</p>
          <div>
            <p class="rule-t">Triage once a day</p>
            <p class="rule-b">
              Coffee in hand, open <strong>Inbox</strong>. For each new item: link the
              SKUs, write what you decided, set an owner. Ten minutes, queue empty.
            </p>
          </div>
        </div>

        <p class="lede" style="margin-top:var(--s4)">
          That is the entire discipline. If you do only those two things this system
          works. Everything below is what you get in return.
        </p>

        <hr class="divider" />

        <h2>Why capture and triage are separate</h2>
        <p>
          This is the one design decision worth understanding. Deciding
          <em>what a thing means</em> is slow. Writing down
          <em>what was said</em> is fast.
        </p>
        <p>
          If you have to pick a category and find a SKU while Danny is still talking,
          you will not do it — and a system nobody feeds is worse than the text thread
          you had before. So capture asks for almost nothing, and triage happens later
          when you have a minute.
        </p>
        <div class="callout">
          <strong>Never edit the note itself.</strong> It is the record of what was
          actually said. Your interpretation goes in the <em>decision</em> field. When
          someone later says "that is not what I told you," the raw note settles it.
        </div>

        <hr class="divider" />

        <h2>What each tab is for</h2>

        <ul class="taboverview">
          <li>
            <span class="tab-name">Capture</span>
            <span
              >Four fields, one required. The only screen you use in the moment.</span
            >
          </li>
          <li>
            <span class="tab-name">Inbox</span>
            <span
              >Everything you have logged. Your daily ten minutes lives here.
              ${newItems > 0
                ? html`<strong>${newItems} waiting right now.</strong>`
                : raw('Currently empty — good.')}</span
            >
          </li>
          <li>
            <span class="tab-name">SKUs</span>
            <span
              >All ${products} products. Search, filter, and answer questions like
              "which ones have no spec?"</span
            >
          </li>
          <li>
            <span class="tab-name">Orders</span>
            <span
              >${pos} purchase orders and every line on them. Generates the PDF you send
              to Mike.</span
            >
          </li>
        </ul>

        <hr class="divider" />

        <h2>The move that earns its keep</h2>
        <p>
          Danny asks to change something on a pack. Before you brief Shaun, open that
          SKU and look at <strong>On order</strong>.
        </p>
        <p>
          Right now there are <strong>${onOrder.toLocaleString()} units</strong> of
          material on order across the catalogue. If a flavour you are about to change
          has 63,000 stick films already bought, that is not a design question any
          more — it is run them out or eat them, and it is a decision worth making on
          purpose.
        </p>
        <div class="callout">
          <strong>Danny says one flavour; it is usually two SKUs.</strong> Blueberry
          Muffin is a pouch and a stick. When you link one at triage, the app offers
          the siblings — take the offer.
        </div>

        <hr class="divider" />

        <h2>When something new needs codes</h2>
        <p>
          A new flavour needs two codes, and two different people make them: someone
          else invents the SKU, you allocate the GS1 number. That split is built in.
          Start a request on <a href="/codes">New codes</a> and the app proposes both,
          reading the patterns out of the ${products} codes you already have.
        </p>
        <p>
          Every suggestion comes with its reasoning and any warning — the abbreviation
          this flavour already uses elsewhere, whether those letters already mean
          something else, how full the GS1 prefix is. Nothing is applied silently.
        </p>
        <div class="callout">
          <strong>You do not need to give anyone an account.</strong> Create a share
          link scoped to the SKU and text it. They see the flavour and the suggested
          code, and can accept it or type their own. The link cannot touch the GTIN,
          and it expires.
        </div>
        <p class="lede">
          Nothing becomes a real product until both codes are agreed — then one button
          creates the catalogue row.
        </p>

        <hr class="divider" />

        <h2>Try these three things today</h2>

        <ol class="tasklist">
          <li>
            <strong>Capture something real.</strong> The next time anyone tells you
            anything about a product, log it. Do not tidy it up.
            <a href="/capture">Open Capture →</a>
          </li>
          <li>
            <strong>Work one seeded item.</strong> There are already real findings in
            your inbox from the audit of your spreadsheets. Open one, write a decision,
            set a due date. <a href="/inbox?status=NEW">Open Inbox →</a>
          </li>
          <li>
            <strong>Run a real query.</strong> ${noSpec} of your ${products} SKUs have
            no usable packaging spec. See which.
            <a href="/products?flag=missing_spec&amp;group=productLine">Show me →</a>
          </li>
        </ol>

        <hr class="divider" />

        <h2>What a normal week costs</h2>
        <ul class="plain">
          <li><strong>Daily</strong> — capture as things happen. Seconds, not minutes.</li>
          <li><strong>Each morning</strong> — clear the triage queue. Ten minutes.</li>
          <li><strong>Monday</strong> — a summary notification lands. Read it, reprioritise.</li>
          <li><strong>As needed</strong> — update PO line status when Mike reports in.</li>
        </ul>
        <p class="lede">
          About fifteen minutes a day. Against which you stop scrolling text threads to
          reconstruct what was decided.
        </p>

        <hr class="divider" />

        <h2>Not built yet</h2>
        <p class="lede">
          So you know where the edges are: artwork version tracking, NFP sign-off from
          Danny, quote history for keeping Mike honest, and vendor delivery timing are
          all designed but not yet built. Purchase orders can be viewed and exported
          but not yet created in the app.
        </p>

        <div class="btn-row" style="margin-top:var(--s4)">
          <a class="btn" href="/capture">Capture something</a>
          <a class="btn btn-ghost" href="/">Back to Today</a>
        </div>
      `),
    );
  });
}
