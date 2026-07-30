/**
 * Loads the normalized CSVs in ../../data into Postgres.
 *
 * Safe to re-run — everything upserts. Purchase orders are matched on their
 * MMDDYY number, products on SKU.
 *
 * Callable two ways:
 *   - `npm run seed` via the prisma/seed.ts wrapper
 *   - automatically on first boot (see src/bootstrap.ts), so deploying does
 *     not depend on having shell access to the running container
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import {
  PackFormat,
  ProductStatus,
  PoLineStatus,
  InboxArea,
  Priority,
} from '@prisma/client';
import { hashPassword } from './crypto';


// Resolves to app/data from both src/lib (tsx) and dist/lib (compiled), and
// falls back to the repo-root data/ for a local run straight after a rebuild.
const DATA = [
  path.join(__dirname, '..', '..', 'data'),
  path.join(__dirname, '..', '..', '..', 'data'),
].find((p) => existsSync(p)) ?? path.join(__dirname, '..', '..', 'data');

// ------------------------------------------------------------ csv parsing

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function load(name: string): Record<string, string>[] {
  const p = path.join(DATA, name);
  if (!existsSync(p)) {
    console.warn(`  ! ${name} not found — skipping`);
    return [];
  }
  return parseCsv(readFileSync(p, 'utf8'));
}

const fmt = (v: string): PackFormat =>
  ({ Pouch: 'POUCH', Stick: 'STICK', Box: 'BOX', Cup: 'CUP' })[v] as PackFormat;

const num = (v: string) => (v === '' || v == null ? null : Number(v));
const str = (v: string) => (v === '' ? null : v);

const AREA_VALUES = new Set([
  'ARTWORK', 'FORMULA', 'SPEC', 'GTIN', 'SKU', 'NEW_SKU',
  'PO', 'SHOPIFY', 'NFP', 'VENDOR', 'OTHER',
]);

/** Anything the CSV cannot map lands in OTHER rather than failing the import. */
function toArea(v: string): InboxArea {
  const key = (v || '').toUpperCase().replace(/[^A-Z]+/g, '_');
  return (AREA_VALUES.has(key) ? key : 'OTHER') as InboxArea;
}

/** GS1 check digit — stored on Product so views can filter on it. */
function gtinValid(gtin: string | null): boolean {
  if (!gtin || !/^\d+$/.test(gtin)) return false;
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  const body = gtin.slice(0, -1);
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    total += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (total % 10)) % 10 === Number(gtin[gtin.length - 1]);
}

const PRIORITY_VALUES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
function toPriority(v: string): Priority {
  const key = (v || '').toUpperCase();
  return (PRIORITY_VALUES.has(key) ? key : 'MEDIUM') as Priority;
}

// ----------------------------------------------------------------- main

export interface SeedResult {
  ownerEmail: string;
  ownerPassword: string | null;
  staffEmail: string | null;
  staffPassword: string | null;
  products: number;
}

export async function runSeed(prisma: PrismaClient): Promise<SeedResult> {
  console.log('Seeding ProDough PM…\n');

  // -- users ---------------------------------------------------------
  const ownerEmail = (process.env.SEED_OWNER_EMAIL || 'lowry@powder-ops.com').toLowerCase();
  let ownerPassword = process.env.SEED_OWNER_PASSWORD || '';
  let generated = false;
  if (!ownerPassword) {
    ownerPassword = randomBytes(9).toString('base64url');
    generated = true;
  }

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { role: 'OWNER' },
    create: {
      email: ownerEmail,
      name: process.env.SEED_OWNER_NAME || 'Lowry Akers',
      role: 'OWNER',
      passwordHash: await hashPassword(ownerPassword),
    },
  });
  console.log(`  owner            ${owner.email}`);
  if (generated) {
    console.log('');
    console.log('  ┌───────────────────────────────────────────────');
    console.log(`  │  TEMPORARY PASSWORD:  ${ownerPassword}`);
    console.log('  │  Sign in, then change it in Settings.');
    console.log('  └───────────────────────────────────────────────');
    console.log('');
  }

  let staffCredential: string | null = null;
  const staffEmail = (process.env.SEED_STAFF_EMAIL || '').toLowerCase();
  if (staffEmail) {
    let staffPassword = process.env.SEED_STAFF_PASSWORD || '';
    let staffGenerated = false;
    if (!staffPassword) {
      staffPassword = randomBytes(9).toString('base64url');
      staffGenerated = true;
    }
    await prisma.user.upsert({
      where: { email: staffEmail },
      update: {},
      create: {
        email: staffEmail,
        name: process.env.SEED_STAFF_NAME || 'Assistant',
        role: 'STAFF',
        passwordHash: await hashPassword(staffPassword),
      },
    });
    console.log(`  staff            ${staffEmail}`);
    if (staffGenerated) {
      staffCredential = staffPassword;
      console.log(`    temp password: ${staffPassword}`);
    }
  }

  // -- vendor --------------------------------------------------------
  const pps = await prisma.vendor.upsert({
    where: { name: 'Professional Packaging Services (PPS)' },
    update: {},
    create: {
      name: 'Professional Packaging Services (PPS)',
      contactName: 'Michael Rino',
      email: 'mrino@propackserv.com',
      phone: '801-647-2889',
      address: '1192 E. Draper Parkway #345\nDraper, UT 84020',
    },
  });
  console.log(`  vendor           ${pps.name}`);

  // -- contacts ------------------------------------------------------
  const contacts = load('contacts.csv');
  const contactByName = new Map<string, string>();
  for (const c of contacts) {
    const existing = await prisma.contact.findFirst({ where: { name: c.name } });
    const rec = existing
      ? await prisma.contact.update({
          where: { id: existing.id },
          data: { roleTitle: c.role, org: c.org, provides: str(c.provides) },
        })
      : await prisma.contact.create({
          data: {
            name: c.name,
            roleTitle: c.role,
            org: c.org,
            provides: str(c.provides),
            isExternal: !c.name.includes('Lowry'),
          },
        });
    contactByName.set(c.name, rec.id);
    // short first-name key too, so "Danny" resolves
    contactByName.set(c.name.split(' ')[0], rec.id);
  }
  console.log(`  contacts         ${contacts.length}`);

  // -- packaging specs ----------------------------------------------
  const specs = load('packaging_specs.csv');
  for (const s of specs) {
    const data = {
      name: s.spec_name,
      format: fmt(s.format),
      materialStructure: str(s.material_structure),
      zipper: str(s.zipper),
      printProcess: str(s.print_process),
      trimLengthMm: num(s.trim_length_mm),
      trimWidthMm: num(s.trim_width_mm),
      gussetMm: num(s.gusset_mm),
      frontPanelMm: num(s.front_panel_mm),
      windDirection: str(s.wind_direction),
      coreIn: str(s.core_in),
      dielineRequired: s.dieline_required === 'TRUE',
      vendorSpecString: str(s.vendor_spec_string),
      notes: str(s.notes),
      vendorId: s.vendor ? pps.id : null,
    };
    await prisma.packagingSpec.upsert({
      where: { specId: s.spec_id },
      update: data,
      create: { specId: s.spec_id, ...data },
    });
  }
  console.log(`  packaging specs  ${specs.length}`);

  // -- products ------------------------------------------------------
  const products = load('products.csv');
  for (const p of products) {
    const data = {
      gtin: str(p.gtin),
      gtinValid: gtinValid(str(p.gtin)),
      productLine: p.product_line,
      format: fmt(p.format),
      flavor: p.flavor,
      baseFlavor: p.base_flavor,
      specId: str(p.spec_id),
      status: (p.status?.toUpperCase().replace(/ /g, '_') || 'ACTIVE') as ProductStatus,
      shopifySku: str(p.shopify_sku),
      shopifyVariantId: str(p.shopify_variant_id),
      mrpFormulaId: str(p.mrp_formula_id),
      formulaRev: str(p.formula_rev),
      eyemarkColor: str(p.eyemark_color),
      dielineRequired: p.dieline_required === 'TRUE',
      dataQualityFlag: str(p.data_quality_flag),
      notes: str(p.notes),
    };
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: data,
      create: { sku: p.sku, ...data },
    });
  }
  console.log(`  products         ${products.length}`);

  // -- colours -------------------------------------------------------
  const colors = load('sku_colors.csv');
  const validSkus = new Set(products.map((p) => p.sku));
  let colorCount = 0;
  for (const c of colors) {
    if (!validSkus.has(c.sku)) continue;
    const slot = Number(c.slot);
    const data = {
      pms: str(c.pms),
      hex: str(c.hex),
      hexValid: c.hex_valid === 'TRUE',
      pmsValid: c.pms_valid === 'TRUE',
    };
    await prisma.skuColor.upsert({
      where: { sku_slot: { sku: c.sku, slot } },
      update: data,
      create: { sku: c.sku, slot, ...data },
    });
    colorCount++;
  }
  console.log(`  colour slots     ${colorCount}`);

  // -- purchase orders ----------------------------------------------
  const pos = load('purchase_orders.csv');
  const lines = load('po_lines.csv');
  const shipTo = 'Danny\nProDough Shop\n281 E 1600 N\nVineyard, UT 84059\n(773) 958-4218\ndanny@prodoughshop.com';

  for (const po of pos) {
    const poLines = lines.filter((l) => l.po_number === po.po_number);

    const existing = await prisma.purchaseOrder.findUnique({
      where: { poNumber: po.po_number },
    });

    const header = {
      poDate: po.po_date ? new Date(po.po_date) : null,
      sentAt: po.po_date ? new Date(po.po_date) : null,
      vendorId: pps.id,
      category: str(po.category),
      status: 'SENT' as const,
      authorizedBy: str(po.authorized_by),
      shipTo,
      notes: str(po.notes),
    };

    const record = existing
      ? await prisma.purchaseOrder.update({ where: { id: existing.id }, data: header })
      : await prisma.purchaseOrder.create({
          data: { poNumber: po.po_number, ...header },
        });

    // Rebuild lines each run so a corrected CSV is reflected exactly.
    await prisma.pOLine.deleteMany({ where: { poId: record.id } });
    await prisma.pOLine.createMany({
      data: poLines.map((l) => ({
        poId: record.id,
        lineNo: Number(l.line_no),
        sku: validSkus.has(l.sku) ? l.sku : null,
        specId: str(l.spec_id),
        description: str(l.description),
        qty: Number(l.qty),
        unitCost: l.unit_cost,
        excluded: l.excluded === 'TRUE',
        exclusionNote: str(l.exclusion_note),
        lineStatus: (l.line_status?.toUpperCase() || 'ORDERED') as PoLineStatus,
      })),
    });

    const included = poLines.filter((l) => l.excluded !== 'TRUE');
    const total = included.reduce((n, l) => n + Number(l.unit_cost) * Number(l.qty), 0);
    console.log(
      `  PO ${po.po_number.padEnd(7)} ${String(poLines.length).padStart(2)} lines · ` +
        `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` +
        (poLines.length - included.length
          ? `  (${poLines.length - included.length} excluded)`
          : ''),
    );
  }

  // -- seeded inbox items --------------------------------------------
  const changes = load('change_log.csv');
  let seeded = 0;
  for (const c of changes) {
    const clientId = `seed-${c.id}`;
    const exists = await prisma.inboxItem.findUnique({ where: { clientId } });
    if (exists) continue;

    const skus = c.sku_affected
      .split(',')
      .map((s) => s.trim())
      .filter((s) => validSkus.has(s));

    await prisma.inboxItem.create({
      data: {
        clientId,
        rawNote: c.raw_note,
        decision: str(c.decision),
        area: toArea(c.area),
        channel: 'AUDIT',
        status: 'NEW',
        priority: toPriority(c.priority),
        dueDate: c.due ? new Date(c.due) : null,
        loggedById: owner.id,
        ownerId: owner.id,
        products: skus.length ? { connect: skus.map((sku) => ({ sku })) } : undefined,
      },
    });
    seeded++;
  }
  console.log(`  inbox items      ${seeded} seeded from the audit`);
  console.log('\nDone.');

  return {
    ownerEmail,
    ownerPassword: generated ? ownerPassword : null,
    staffEmail: staffEmail || null,
    staffPassword: staffCredential,
    products: products.length,
  };
}
