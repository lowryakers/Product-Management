import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';

type PoWithLines = Prisma.PurchaseOrderGetPayload<{
  include: {
    vendor: true;
    lines: { include: { product: true; spec: true } };
  };
}>;

const INK = '#1C1714';
const MUTED = '#6E655C';
const RULE = '#D8D2C9';
const ACCENT = '#945631';
const CRIT = '#A81E23';

const M = 48; // page margin
const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface PoPdfOptions {
  logo?: { data: Buffer; mimeType: string } | null;
  shipTo?: string[];
}

/**
 * Renders a purchase order.
 *
 * Two behaviours are deliberate and differ from the old spreadsheet:
 *   - Excluded lines print greyed and struck, and are NOT summed. This is the
 *     $24,850 fix made structural.
 *   - The footer's SKU count and spec string are derived from the data, so they
 *     cannot drift the way "SKUs: 21" did on a 38-line PO.
 */
export function renderPoPdf(po: PoWithLines, opts: PoPdfOptions = {}): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'LETTER', margin: M, bufferPages: true });

  const pageW = doc.page.width;
  const contentW = pageW - M * 2;

  // ---------------------------------------------------------------- header
  let headerBottom = M;
  if (opts.logo && /^image\/(png|jpe?g)$/.test(opts.logo.mimeType)) {
    try {
      // fit keeps aspect ratio; left/top are the defaults so they are not passed
      doc.image(opts.logo.data, M, M, { fit: [190, 46] });
      headerBottom = M + 50;
    } catch {
      headerBottom = drawWordmark(doc, M, M);
    }
  } else {
    headerBottom = drawWordmark(doc, M, M);
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .fillColor(INK)
    .text('PURCHASE ORDER', M, M + 4, { width: contentW, align: 'right' });

  const y0 = Math.max(headerBottom, M + 34) + 14;
  hr(doc, y0);

  // ------------------------------------------------------------ meta block
  let y = y0 + 14;
  const colW = contentW / 4;
  const meta: Array<[string, string]> = [
    ['P.O. Number', po.poNumber ?? 'DRAFT'],
    ['P.O. Date', fmtDate(po.poDate ?? po.createdAt)],
    ['Ship Date', po.sentAt ? fmtDate(po.sentAt) : 'N/A'],
    ['Status', po.status.replace(/_/g, ' ')],
  ];
  meta.forEach(([k, v], i) => {
    const x = M + colW * i;
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(k.toUpperCase(), x, y, { width: colW - 8 });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(po.poNumber || i > 0 ? INK : CRIT)
      .text(v, x, y + 11, { width: colW - 8 });
  });
  y += 40;

  // ------------------------------------------------------- ship to / vendor
  const shipTo = opts.shipTo ?? (po.shipTo ? po.shipTo.split('\n') : []);
  const vendorLines = [
    po.vendor.contactName ?? '',
    po.vendor.name,
    ...(po.vendor.address ? po.vendor.address.split('\n') : []),
    po.vendor.phone ?? '',
    po.vendor.email ?? '',
  ].filter(Boolean);

  const halfW = contentW / 2 - 10;
  doc.font('Helvetica').fontSize(7).fillColor(MUTED).text('SHIP TO', M, y);
  doc.text('VENDOR', M + contentW / 2, y);
  doc.font('Helvetica').fontSize(9.5).fillColor(INK);
  doc.text(shipTo.join('\n'), M, y + 12, { width: halfW });
  const leftEnd = doc.y;
  doc.text(vendorLines.join('\n'), M + contentW / 2, y + 12, { width: halfW });
  y = Math.max(leftEnd, doc.y) + 16;

  // ---------------------------------------------------------------- table
  // Letter minus margins is 516pt. These offsets must sum inside that or the
  // money column wraps mid-number.
  const cols = {
    desc: M,
    flavor: M + 148,
    sku: M + 248,
    qty: M + 330,
    unit: M + 386,
    total: M + 442,
  };
  const rightEdge = M + contentW;
  const QTY_W = 56;
  const UNIT_W = 52;
  const TOTAL_W = rightEdge - cols.total;

  const drawHead = (yy: number) => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED);
    doc.text('DESCRIPTION', cols.desc, yy);
    doc.text('FLAVOR', cols.flavor, yy);
    doc.text('SKU', cols.sku, yy);
    doc.text('QTY', cols.qty, yy, { width: QTY_W, align: 'right' });
    doc.text('UNIT', cols.unit, yy, { width: UNIT_W, align: 'right' });
    doc.text('TOTAL', cols.total, yy, { width: TOTAL_W, align: 'right' });
    doc.moveTo(M, yy + 11).lineTo(rightEdge, yy + 11).lineWidth(0.9).strokeColor(INK).stroke();
    return yy + 17;
  };

  y = drawHead(y);

  const included = po.lines.filter((l) => !l.excluded);
  let totalQty = 0;
  let totalCost = 0;

  const sorted = [...po.lines].sort((a, b) => a.lineNo - b.lineNo);

  for (const line of sorted) {
    if (y > doc.page.height - 150) {
      doc.addPage();
      y = drawHead(M);
    }

    const ext = Number(line.unitCost) * line.qty;
    const dim = line.excluded;
    const color = dim ? MUTED : INK;

    doc.font('Helvetica').fontSize(8.5).fillColor(color);
    doc.text(line.description ?? line.spec?.name ?? '', cols.desc, y, {
      width: cols.flavor - cols.desc - 6,
      ellipsis: true,
      height: 11,
    });
    doc.text(line.product?.baseFlavor ?? '', cols.flavor, y, {
      width: cols.sku - cols.flavor - 6,
      ellipsis: true,
      height: 11,
    });
    doc.font('Courier').fontSize(7.5).fillColor(color);
    doc.text(line.sku ?? '—', cols.sku, y + 0.5, {
      width: cols.qty - cols.sku - 6,
      ellipsis: true,
      height: 11,
    });
    doc.font('Helvetica').fontSize(8.5).fillColor(color);
    doc.text(line.qty.toLocaleString('en-US'), cols.qty, y, { width: QTY_W, align: 'right' });
    doc.text(Number(line.unitCost).toFixed(4), cols.unit, y, { width: UNIT_W, align: 'right' });
    doc.text(money(ext), cols.total, y, { width: TOTAL_W, align: 'right' });

    if (dim) {
      // struck through, and the note prints so the vendor sees why
      doc
        .moveTo(cols.desc, y + 5.5)
        .lineTo(rightEdge, y + 5.5)
        .lineWidth(0.5)
        .strokeColor(MUTED)
        .stroke();
      y += 12;
      doc
        .font('Helvetica-Oblique')
        .fontSize(7)
        .fillColor(CRIT)
        .text(`EXCLUDED — ${line.exclusionNote ?? 'not on this order'} · not included in total`,
          cols.desc + 8, y, { width: contentW - 8 });
      y += 11;
    } else {
      totalQty += line.qty;
      totalCost += ext;
      y += 13;
    }
  }

  // ---------------------------------------------------------------- totals
  doc.moveTo(M, y + 2).lineTo(rightEdge, y + 2).lineWidth(0.9).strokeColor(INK).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
  doc.text(`${included.length} line${included.length === 1 ? '' : 's'}`, cols.desc, y);
  doc.text(totalQty.toLocaleString('en-US'), cols.qty, y, { width: QTY_W, align: 'right' });
  doc.text(money(totalCost), cols.total, y, { width: TOTAL_W, align: 'right' });
  y += 20;

  const excludedCount = po.lines.length - included.length;
  if (excludedCount > 0) {
    const excludedCost = po.lines
      .filter((l) => l.excluded)
      .reduce((n, l) => n + Number(l.unitCost) * l.qty, 0);
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(
        `${excludedCount} line${excludedCount === 1 ? '' : 's'} excluded (${money(excludedCost)}) — shown above for reference only.`,
        M,
        y,
        { width: contentW },
      );
    y += 16;
  }

  // ----------------------------------------------------------- authorisation
  y += 8;
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  doc.text(`Authorized By: ${po.authorizedBy ?? ''}`, M, y);
  y += 24;

  // ------------------------------------------------------------ spec footer
  const specs = [...new Map(po.lines.filter((l) => l.spec).map((l) => [l.spec!.specId, l.spec!])).values()];
  if (specs.length) {
    hr(doc, y);
    y += 10;
    for (const spec of specs) {
      const skuCount = new Set(
        po.lines.filter((l) => !l.excluded && l.specId === spec.specId).map((l) => l.sku),
      ).size;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(ACCENT).text(spec.name.toUpperCase(), M, y);
      y += 10;
      doc.font('Helvetica').fontSize(8).fillColor(INK);
      const facts = [
        spec.vendorSpecString,
        spec.materialStructure ? `Structure: ${spec.materialStructure}` : null,
        spec.printProcess ? `Print: ${spec.printProcess}` : null,
        spec.zipper ? `Zipper: ${spec.zipper}` : null,
        spec.coreIn ? `Core: ${spec.coreIn}` : null,
        `SKUs: ${skuCount}`,
      ].filter(Boolean) as string[];
      doc.text(facts.join('  ·  '), M, y, { width: contentW });
      y = doc.y + 8;
    }
  }

  // ------------------------------------------------------------ page footer
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        `PO ${po.poNumber ?? 'DRAFT'} · ${po.vendor.name} · page ${i - range.start + 1} of ${range.count}`,
        M,
        doc.page.height - 34,
        { width: contentW, align: 'center' },
      );
  }

  return doc;
}

function drawWordmark(doc: PDFKit.PDFDocument, x: number, y: number): number {
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text('ProDough', x, y);
  const w = doc.widthOfString('ProDough');
  doc.font('Helvetica').fontSize(7).text('®', x + w + 2, y + 2);
  return y + 30;
}

function hr(doc: PDFKit.PDFDocument, y: number) {
  doc
    .moveTo(M, y)
    .lineTo(doc.page.width - M, y)
    .lineWidth(0.7)
    .strokeColor(RULE)
    .stroke();
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** MMDDYY, matching the convention already in use (42826 = 2026-04-28). */
export function poNumberForDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}${dd}${yy}`.replace(/^0/, '');
}
