/**
 * SKU and GTIN suggestion.
 *
 * Two different jobs get done here, because two different people do them:
 * someone else invents the SKU, Lowry allocates the GS1 number. Both are
 * suggestions, never silently applied — every proposal comes back with the
 * reasoning that produced it and any warning that should stop you.
 *
 * The rules below were read off the existing 118 codes, not invented. Where
 * the existing codes disagree with each other (37 of 118 abbreviations do),
 * the suggester prefers what the catalogue already says over what a clean
 * rule would say, and reports the disagreement instead of hiding it.
 */

export type Fmt = 'POUCH' | 'STICK' | 'BOX' | 'CUP';

export interface CatalogEntry {
  sku: string;
  gtin: string | null;
  productLine: string;
  format: Fmt | string;
  baseFlavor: string;
}

// ------------------------------------------------------------ SKU families

export interface Family {
  line: string;
  format: Fmt;
  prefix: string;
  /** Whether codes in this family carry a trailing -NN serial. */
  sequenced: boolean;
  note?: string;
}

/**
 * PP was created to mean "Protein Pouch" — not "whey pouch". Plant pouches
 * living under PP is therefore correct; what is wrong is that they were given
 * serials 21-24, which whey had already used. The serial pool is keyed on the
 * prefix (see nextSerial) precisely so that cannot happen again.
 *
 * HBP is the one code in this table that does not yet exist in the catalogue.
 * The four Beef Protein pouches currently carry 14-digit Shopify ids in the
 * SKU column — they have no SKU at all, so there is nothing to preserve.
 */
export const FAMILIES: Family[] = [
  { line: 'Whey Protein', format: 'POUCH', prefix: 'PP', sequenced: true },
  { line: 'Plant Protein', format: 'POUCH', prefix: 'PP', sequenced: true, note: 'shares the PP serial pool with whey' },
  { line: 'Whey Protein', format: 'STICK', prefix: 'PSP', sequenced: false },
  { line: 'Plant Protein', format: 'STICK', prefix: 'PPSS', sequenced: false },
  { line: 'Beef Protein', format: 'STICK', prefix: 'HBF', sequenced: false },
  { line: 'Beef Protein', format: 'POUCH', prefix: 'HBP', sequenced: false, note: 'proposed — the four current codes are Shopify ids, not SKUs' },
  { line: 'Pancake Mix', format: 'POUCH', prefix: 'PPM', sequenced: false },
  { line: 'Crepe Mix', format: 'POUCH', prefix: 'PCM', sequenced: false },
  { line: 'Cupcake Mix', format: 'POUCH', prefix: 'PCCM', sequenced: true },
  { line: 'Donut Mix', format: 'BOX', prefix: 'PDM', sequenced: true },
  { line: 'Oatmeal Cup', format: 'CUP', prefix: 'POC', sequenced: false },
  { line: 'Daily Recharge', format: 'POUCH', prefix: 'DR', sequenced: false },
  { line: 'Daily Recharge', format: 'STICK', prefix: 'DR', sequenced: false },
  { line: 'Gluten Free Flour', format: 'POUCH', prefix: 'GFFB', sequenced: false },
];

export function findFamily(line: string, format: string): Family | null {
  return (
    FAMILIES.find(
      (f) => f.line.toLowerCase() === line.trim().toLowerCase() && f.format === format,
    ) ?? null
  );
}

/** Distinct (line, format) pairs, for the picker. */
export function familyOptions(): Family[] {
  return FAMILIES;
}

// ------------------------------------------------------------ SKU parsing

export interface ParsedSku {
  prefix: string;
  abbr: string;
  serial: number | null;
}

/** `PP-BLM-23` -> prefix PP, abbr BLM, serial 23. Returns null if it does not fit. */
export function parseSku(sku: string): ParsedSku | null {
  const m = /^([A-Z]{2,4})-([A-Z0-9]{1,5})(?:-(\d{1,3}))?$/.exec(sku.trim().toUpperCase());
  if (!m) return null;
  return { prefix: m[1], abbr: m[2], serial: m[3] ? Number(m[3]) : null };
}

/** Plain initials. The starting point, overridden by catalogue precedent. */
export function initialsOf(baseFlavor: string): string {
  const words = baseFlavor.match(/[A-Za-z]+/g) ?? [];
  return words
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();
}

/** Candidate abbreviations in preference order, for a flavour with no precedent. */
function candidateAbbrs(baseFlavor: string): string[] {
  const words = baseFlavor.match(/[A-Za-z]+/g) ?? [];
  const out: string[] = [];
  const push = (s: string) => {
    const v = s.toUpperCase().slice(0, 4);
    if (v.length >= 1 && !out.includes(v)) out.push(v);
  };

  // A one-word flavour gives one initial, and a single letter is a bad code —
  // "Blueberry" wants BLU, not B. Three letters lead in that case.
  if (words.length === 1) {
    push(words[0].slice(0, 3));
    push(initialsOf(baseFlavor));
    push(words[0].slice(0, 4));
  } else if (words.length > 1) {
    push(initialsOf(baseFlavor));
    // "Blueberry Muffin" -> BLM: initials with the first word stretched.
    const [first = '', ...rest] = words;
    const tail = rest.map((w) => w.charAt(0)).join('');
    push(first.slice(0, 2) + tail);
    push(first.slice(0, 3) + tail);
    push(words.map((w) => w.slice(0, 2)).join('').slice(0, 4));
  }
  return out;
}

// ------------------------------------------------------------ suggestions

export interface Suggestion<T> {
  value: T | null;
  /** Plain-English account of how the value was arrived at. */
  basis: string;
  /** Things that should give the person pause. Shown, never suppressed. */
  warnings: string[];
  alternates: T[];
}

export interface SkuInput {
  productLine: string;
  format: string;
  baseFlavor: string;
}

export function suggestSku(input: SkuInput, catalog: CatalogEntry[]): Suggestion<string> {
  const warnings: string[] = [];
  const baseFlavor = input.baseFlavor.trim();
  if (!baseFlavor) {
    return { value: null, basis: 'No flavour given yet.', warnings, alternates: [] };
  }

  const family = findFamily(input.productLine, input.format);
  if (!family) {
    return {
      value: null,
      basis: `No prefix is defined for ${input.productLine} · ${input.format.toLowerCase()}.`,
      warnings: ['This is a new product family. Decide the prefix first, then add it to the standard.'],
      alternates: [],
    };
  }

  const parsed = catalog
    .map((p) => ({ p, k: parseSku(p.sku) }))
    .filter((x): x is { p: CatalogEntry; k: ParsedSku } => x.k !== null);

  // 1. Precedent wins. If this flavour already exists anywhere, reuse its code.
  const sameFlavor = parsed.filter(
    (x) => x.p.baseFlavor.trim().toLowerCase() === baseFlavor.toLowerCase(),
  );
  const inSamePrefix = sameFlavor.find((x) => x.k.prefix === family.prefix);
  const abbrCounts = new Map<string, number>();
  for (const x of sameFlavor) abbrCounts.set(x.k.abbr, (abbrCounts.get(x.k.abbr) ?? 0) + 1);

  let abbr: string;
  let basis: string;

  if (inSamePrefix) {
    abbr = inSamePrefix.k.abbr;
    basis = `${baseFlavor} already uses ${abbr} under ${family.prefix} (${inSamePrefix.p.sku}).`;
  } else if (abbrCounts.size) {
    const ranked = [...abbrCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    abbr = ranked[0][0];
    const example = sameFlavor.find((x) => x.k.abbr === abbr)!.p.sku;
    basis = `${baseFlavor} is already abbreviated ${abbr} elsewhere in the catalogue (${example}).`;
    if (ranked.length > 1) {
      warnings.push(
        `${baseFlavor} is abbreviated ${ranked.length} different ways today: ` +
          ranked.map(([a, n]) => `${a} (${n})`).join(', ') +
          '. Picking the most common one.',
      );
    }
  } else {
    // 2. No precedent. Take the first candidate that is free within this prefix.
    const takenInPrefix = new Map<string, string>();
    for (const x of parsed) {
      if (x.k.prefix === family.prefix) takenInPrefix.set(x.k.abbr, x.p.baseFlavor);
    }
    const cands = candidateAbbrs(baseFlavor);
    abbr = cands.find((c) => !takenInPrefix.has(c)) ?? cands[0] ?? 'XX';
    basis =
      abbr === cands[0]
        ? `New flavour — initials of "${baseFlavor}".`
        : `Initials ${cands[0]} are taken under ${family.prefix} by ${takenInPrefix.get(cands[0])}, so the abbreviation is stretched.`;
  }

  // Same letters, different flavour, somewhere else in the catalogue. This is
  // how CC ended up meaning Cookie Crumble on a pouch and Coconut Cream on a
  // stick. Worth saying out loud before it happens again.
  const clashes = new Set(
    parsed
      .filter(
        (x) =>
          x.k.abbr === abbr &&
          x.p.baseFlavor.trim().toLowerCase() !== baseFlavor.toLowerCase(),
      )
      .map((x) => `${x.p.baseFlavor} (${x.p.sku})`),
  );
  if (clashes.size) {
    warnings.push(`${abbr} already means something else: ${[...clashes].join(', ')}.`);
  }

  const build = (serial: number | null) =>
    serial === null
      ? `${family.prefix}-${abbr}`
      : `${family.prefix}-${abbr}-${String(serial).padStart(2, '0')}`;

  let value: string;
  if (family.sequenced) {
    const serial = nextSerial(family.prefix, parsed);
    value = build(serial);
    basis += ` Next free serial in the ${family.prefix} pool is ${String(serial).padStart(2, '0')}.`;
  } else {
    value = build(null);
  }

  const taken = new Set(catalog.map((p) => p.sku.toUpperCase()));
  if (taken.has(value.toUpperCase())) {
    warnings.push(`${value} already exists. Change the abbreviation before saving.`);
  }

  const alternates = candidateAbbrs(baseFlavor)
    .filter((c) => c !== abbr)
    .slice(0, 3)
    .map((c) =>
      family.sequenced
        ? `${family.prefix}-${c}-${String(nextSerial(family.prefix, parsed)).padStart(2, '0')}`
        : `${family.prefix}-${c}`,
    )
    .filter((s) => !taken.has(s.toUpperCase()));

  return { value, basis, warnings, alternates };
}

/**
 * Serials are unique per prefix, not per product line. That is the whole point:
 * whey took PP 01-30, plant then took 21-24 over the top of it. Next is 31.
 */
export function nextSerial(
  prefix: string,
  parsed: Array<{ k: ParsedSku }>,
): number {
  const used = new Set(
    parsed.filter((x) => x.k.prefix === prefix && x.k.serial !== null).map((x) => x.k.serial!),
  );
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// ----------------------------------------------------------------- GTIN

/** GS1 mod-10. Body is everything but the final digit. */
export function checkDigit(body: string): number {
  let total = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    total += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (total % 10)) % 10;
}

export function gtinValid(gtin: string | null | undefined): boolean {
  if (!gtin || !/^\d+$/.test(gtin)) return false;
  if (![8, 12, 13, 14].includes(gtin.length)) return false;
  return checkDigit(gtin.slice(0, -1)) === Number(gtin[gtin.length - 1]);
}

export interface GtinPool {
  /** The 9-digit GS1 company prefix. */
  prefix: string;
  used: number;
  free: number;
  firstFree: string | null;
  /** Which product lines already sit under this prefix, most-used first. */
  lines: string[];
  /** How many numbers each of those lines has taken. */
  counts: Record<string, number>;
}

/**
 * Every ProDough GTIN is a 12-digit UPC-A: 9-digit company prefix, 2-digit
 * item reference, 1 check digit. That gives 100 numbers per prefix, which is
 * why 850046726 being 76% full matters.
 */
export function gtinPools(catalog: CatalogEntry[]): GtinPool[] {
  const byPrefix = new Map<string, { items: Set<string>; lines: Map<string, number> }>();
  for (const p of catalog) {
    if (!p.gtin || p.gtin.length !== 12 || !/^\d{12}$/.test(p.gtin)) continue;
    const prefix = p.gtin.slice(0, 9);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, { items: new Set(), lines: new Map() });
    const e = byPrefix.get(prefix)!;
    e.items.add(p.gtin.slice(9, 11));
    e.lines.set(p.productLine, (e.lines.get(p.productLine) ?? 0) + 1);
  }

  return [...byPrefix.entries()]
    .map(([prefix, e]) => {
      let firstFree: string | null = null;
      for (let i = 0; i < 100; i++) {
        const item = String(i).padStart(2, '0');
        if (!e.items.has(item)) {
          firstFree = item;
          break;
        }
      }
      const ranked = [...e.lines.entries()].sort((a, b) => b[1] - a[1]);
      return {
        prefix,
        used: e.items.size,
        free: 100 - e.items.size,
        firstFree,
        lines: ranked.map(([l]) => l),
        counts: Object.fromEntries(ranked),
      };
    })
    .sort((a, b) => b.free - a.free);
}

export function suggestGtin(
  productLine: string,
  catalog: CatalogEntry[],
  preferPrefix?: string,
): Suggestion<string> & { pools: GtinPool[]; prefix: string | null } {
  const pools = gtinPools(catalog);
  const warnings: string[] = [];

  if (!pools.length) {
    return {
      value: null,
      prefix: null,
      pools,
      basis: 'No GS1 prefix is in use yet, so there is nothing to allocate from.',
      warnings: ['Enter the first GTIN by hand.'],
      alternates: [],
    };
  }

  // Prefer a prefix this line already uses. Where it uses more than one — whey
  // protein straddles two — take the roomiest, because the alternative is
  // filling up a block that other lines also depend on.
  const homes = pools.filter((p) => p.counts[productLine]);
  const home = homes[0]; // pools are already sorted by free descending
  const emptiest = pools[0]!;
  let pool =
    (preferPrefix && pools.find((p) => p.prefix === preferPrefix)) || home || emptiest;

  let basis: string;
  if (preferPrefix && pool.prefix === preferPrefix) {
    basis = `Allocating from ${pool.prefix} as chosen.`;
  } else if (home && pool === home) {
    basis =
      homes.length > 1
        ? `${productLine} already uses ${homes.length} prefixes; ${pool.prefix} is the one with room (${pool.free} of 100 free).`
        : `${productLine} already sits under ${pool.prefix}, so the next number comes from there.`;
  } else {
    basis = `${productLine} has no prefix of its own yet — using ${pool.prefix}, which has the most room.`;
  }

  if (!pool.firstFree) {
    warnings.push(`${pool.prefix} is completely full. Pick another prefix.`);
    const fallback = pools.find((p) => p.firstFree);
    if (!fallback) {
      return { value: null, prefix: pool.prefix, pools, basis, warnings, alternates: [] };
    }
    pool = fallback;
    basis += ` Falling back to ${pool.prefix}.`;
  }

  if (pool.free <= 25) {
    warnings.push(
      `${pool.prefix} has only ${pool.free} of 100 numbers left. Worth buying the next GS1 block before it runs out.`,
    );
  }

  const body = pool.prefix + pool.firstFree!;
  const value = body + String(checkDigit(body));
  basis += ` Item reference ${pool.firstFree}, check digit ${value.slice(-1)} computed.`;

  // Two more, so an allocation can be skipped without leaving the screen.
  const alternates: string[] = [];
  const usedItems = new Set(
    catalog
      .filter((p) => p.gtin && p.gtin.slice(0, 9) === pool.prefix)
      .map((p) => p.gtin!.slice(9, 11)),
  );
  usedItems.add(pool.firstFree!);
  for (let i = 0; i < 100 && alternates.length < 2; i++) {
    const item = String(i).padStart(2, '0');
    if (usedItems.has(item)) continue;
    const b = pool.prefix + item;
    alternates.push(b + String(checkDigit(b)));
  }

  return { value, prefix: pool.prefix, pools, basis, warnings, alternates };
}
