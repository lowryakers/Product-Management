/**
 * Ad-hoc view engine for the catalog.
 *
 * The whole state of a view — search, filters, sort, grouping, visible columns —
 * lives in the querystring. That makes every view bookmarkable, shareable, and
 * savable without any extra machinery: a SavedView is just a stored querystring.
 */

import type { Prisma } from '@prisma/client';

export interface ViewState {
  q: string;
  line: string[];
  format: string[];
  status: string[];
  spec: string[];
  flags: string[];
  sort: string;
  dir: 'asc' | 'desc';
  group: string;
  cols: string[];
}

// ------------------------------------------------------------------ columns

export interface ColumnDef {
  key: string;
  label: string;
  /** Prisma orderBy path, omitted when the column is not sortable. */
  sortField?: string;
  numeric?: boolean;
  /** Default columns shown when the user has not chosen. */
  defaultOn?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { key: 'sku', label: 'SKU', sortField: 'sku', defaultOn: true },
  { key: 'flavor', label: 'Flavour', sortField: 'flavor', defaultOn: true },
  { key: 'baseFlavor', label: 'Base flavour', sortField: 'baseFlavor' },
  { key: 'gtin', label: 'GTIN', sortField: 'gtin', defaultOn: true },
  { key: 'productLine', label: 'Line', sortField: 'productLine', defaultOn: true },
  { key: 'format', label: 'Format', sortField: 'format' },
  { key: 'status', label: 'Status', sortField: 'status' },
  { key: 'specId', label: 'Spec', sortField: 'specId', defaultOn: true },
  { key: 'eyemarkColor', label: 'Eyemark' },
  { key: 'shopifySku', label: 'Shopify SKU' },
  { key: 'mrpFormulaId', label: 'MRP formula' },
  { key: 'formulaRev', label: 'Formula rev' },
  { key: 'legacySku', label: 'Legacy SKU' },
  { key: 'colorCount', label: 'Colours', numeric: true },
  { key: 'onOrder', label: 'On order', numeric: true, defaultOn: true },
  { key: 'openChanges', label: 'Open changes', numeric: true },
  { key: 'artworkCount', label: 'Artwork versions', numeric: true },
  { key: 'dataQualityFlag', label: 'Flag' },
];

export const DEFAULT_COLS = COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);
const COLUMN_KEYS = new Set(COLUMNS.map((c) => c.key));
const SORTABLE = new Map(COLUMNS.filter((c) => c.sortField).map((c) => [c.key, c.sortField!]));

// ------------------------------------------------------------------- groups

export const GROUPS: Array<{ key: string; label: string }> = [
  { key: '', label: 'No grouping' },
  { key: 'productLine', label: 'Product line' },
  { key: 'format', label: 'Format' },
  { key: 'status', label: 'Status' },
  { key: 'specId', label: 'Packaging spec' },
  { key: 'baseFlavor', label: 'Base flavour' },
];
const GROUP_KEYS = new Set(GROUPS.map((g) => g.key));

// -------------------------------------------------------------------- flags

/**
 * Computed conditions that would otherwise need a hand-written query. Each is a
 * plain Prisma `where` fragment so they compose with everything else.
 */
export const FLAGS: Array<{ key: string; label: string; where: Prisma.ProductWhereInput }> = [
  {
    // "No spec" has to mean no *usable* spec. SPEC-BOX-DONUT and SPEC-CUP-OAT
    // exist as placeholders precisely so the gap is visible, so a bare
    // `specId: null` test would report 2 when the real answer is 31.
    key: 'missing_spec',
    label: 'No usable spec',
    where: {
      OR: [
        { specId: null },
        { spec: { OR: [{ materialStructure: null }, { materialStructure: '' }] } },
      ],
    },
  },
  { key: 'no_spec_link', label: 'No spec linked at all', where: { specId: null } },
  { key: 'bad_gtin', label: 'GTIN invalid', where: { gtinValid: false } },
  { key: 'no_gtin', label: 'No GTIN', where: { gtin: null } },
  { key: 'no_colors', label: 'No colours recorded', where: { colors: { none: {} } } },
  {
    key: 'bad_hex',
    label: 'Has an invalid hex',
    where: { colors: { some: { hexValid: false, hex: { not: null } } } },
  },
  {
    key: 'stick_no_eyemark',
    label: 'Stick with no eyemark',
    where: { format: 'STICK', OR: [{ eyemarkColor: null }, { eyemarkColor: '' }] },
  },
  {
    key: 'open_changes',
    label: 'Has open changes',
    where: { inboxItems: { some: { status: { notIn: ['DONE'] } } } },
  },
  {
    key: 'on_order',
    label: 'Has material on order',
    where: {
      poLines: {
        some: { excluded: false, lineStatus: { notIn: ['STOCKED', 'CANCELLED'] } },
      },
    },
  },
  {
    key: 'never_ordered',
    label: 'Never ordered',
    where: { poLines: { none: {} } },
  },
  { key: 'flagged', label: 'Needs review', where: { NOT: { dataQualityFlag: null } } },
  { key: 'no_artwork', label: 'No artwork version', where: { artworkVersions: { none: {} } } },
];
const FLAG_BY_KEY = new Map(FLAGS.map((f) => [f.key, f]));

// ------------------------------------------------------------------ parsing

function asArray(v: unknown): string[] {
  if (v === undefined || v === null || v === '') return [];
  return (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
}

export function parseView(query: Record<string, unknown>): ViewState {
  const cols = asArray(query.cols).flatMap((c) => c.split(',')).filter((c) => COLUMN_KEYS.has(c));
  const sortKey = String(query.sort ?? 'sku');
  const group = String(query.group ?? '');

  return {
    q: String(query.q ?? '').trim(),
    line: asArray(query.line),
    format: asArray(query.format).map((f) => f.toUpperCase()),
    status: asArray(query.status).map((s) => s.toUpperCase()),
    spec: asArray(query.spec),
    flags: asArray(query.flag).filter((f) => FLAG_BY_KEY.has(f)),
    sort: SORTABLE.has(sortKey) ? sortKey : 'sku',
    dir: query.dir === 'desc' ? 'desc' : 'asc',
    group: GROUP_KEYS.has(group) ? group : '',
    cols: cols.length ? cols : DEFAULT_COLS,
  };
}

/** Round-trips the state back to a querystring, omitting anything at default. */
export function serializeView(v: ViewState): string {
  const p = new URLSearchParams();
  if (v.q) p.set('q', v.q);
  v.line.forEach((x) => p.append('line', x));
  v.format.forEach((x) => p.append('format', x));
  v.status.forEach((x) => p.append('status', x));
  v.spec.forEach((x) => p.append('spec', x));
  v.flags.forEach((x) => p.append('flag', x));
  if (v.sort !== 'sku') p.set('sort', v.sort);
  if (v.dir !== 'asc') p.set('dir', v.dir);
  if (v.group) p.set('group', v.group);
  const sameCols =
    v.cols.length === DEFAULT_COLS.length && v.cols.every((c, i) => c === DEFAULT_COLS[i]);
  if (!sameCols) p.set('cols', v.cols.join(','));
  return p.toString();
}

/** Returns a URL with one parameter toggled — used by every filter chip. */
export function toggleParam(v: ViewState, key: keyof ViewState, value: string): string {
  const next: ViewState = { ...v, [key]: [...(v[key] as string[])] } as ViewState;
  const arr = next[key] as string[];
  const i = arr.indexOf(value);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(value);
  const qs = serializeView(next);
  return qs ? `?${qs}` : '?';
}

export function withParam(v: ViewState, patch: Partial<ViewState>): string {
  const qs = serializeView({ ...v, ...patch });
  return qs ? `?${qs}` : '?';
}

// ------------------------------------------------------------------ builders

export function buildWhere(v: ViewState): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (v.q) {
    and.push({
      OR: [
        { sku: { contains: v.q, mode: 'insensitive' } },
        { flavor: { contains: v.q, mode: 'insensitive' } },
        { baseFlavor: { contains: v.q, mode: 'insensitive' } },
        { gtin: { contains: v.q } },
        { legacySku: { contains: v.q, mode: 'insensitive' } },
        { shopifySku: { contains: v.q, mode: 'insensitive' } },
      ],
    });
  }
  if (v.line.length) and.push({ productLine: { in: v.line } });
  if (v.format.length) and.push({ format: { in: v.format as any } });
  if (v.status.length) and.push({ status: { in: v.status as any } });
  if (v.spec.length) and.push({ specId: { in: v.spec } });

  // Multiple flags intersect — "no spec AND on order" is the useful reading.
  for (const key of v.flags) {
    const f = FLAG_BY_KEY.get(key);
    if (f) and.push(f.where);
  }

  return and.length ? { AND: and } : {};
}

export function buildOrderBy(v: ViewState): Prisma.ProductOrderByWithRelationInput[] {
  const field = SORTABLE.get(v.sort) ?? 'sku';
  const primary = { [field]: v.dir } as Prisma.ProductOrderByWithRelationInput;
  // Grouping only reads cleanly if the group key sorts first.
  if (v.group && v.group !== field) {
    return [{ [v.group]: 'asc' } as Prisma.ProductOrderByWithRelationInput, primary];
  }
  return [primary];
}

export function isDefaultView(v: ViewState): boolean {
  return serializeView(v) === '';
}

export function activeFilterCount(v: ViewState): number {
  return (
    v.line.length + v.format.length + v.status.length + v.spec.length + v.flags.length + (v.q ? 1 : 0)
  );
}

export const FORMATS = ['POUCH', 'STICK', 'BOX', 'CUP'];
export const STATUSES = ['CONCEPT', 'IN_DEVELOPMENT', 'ACTIVE', 'ON_HOLD', 'DISCONTINUED'];

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
