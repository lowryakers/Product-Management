#!/usr/bin/env python3
"""
Audit the master SKU sheet for the errors a spreadsheet cannot prevent.

Checks:
  1. GS1 check digit on every GTIN
  2. Duplicate GTINs
  3. Duplicate / colliding SKU codes
  4. Non-SKU values in the SKU column (Shopify variant IDs)
  5. Invalid hex colour values
  6. Malformed PMS references
  7. Missing packaging specs
  8. Missing eyemark on stick packs

Run monthly against a fresh export. Exit code is non-zero if anything Critical
or High is found, so it can be wired into a scheduled check.

Usage: python3 scripts/audit_master.py [path-to-csv]
"""

import collections
import csv
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT = os.path.join(ROOT, "source", "master_artwork_sheet.csv")

HEX_RE = re.compile(r"^(HEX|HX)\s+([0-9A-Fa-f]{6})$")


def gtin_valid(g):
    g = (g or "").strip()
    if not g.isdigit() or len(g) not in (8, 12, 13, 14):
        return None
    total = 0
    for i, d in enumerate(reversed(g[:-1])):
        total += int(d) * (3 if i % 2 == 0 else 1)
    return (10 - total % 10) % 10 == int(g[-1])


def base_flavor(f):
    f = re.sub(r"\s*(Whey|Beef|Plant)\s*Protein\s*(Pouch|Stick)$", "", f)
    f = re.sub(r"\s*Protein\s*(Pancake|Crepe|Cupcake|Donut)\s*Mix$", "", f)
    f = re.sub(r"\s*Protein\s*Oatmeal\s*Cup$", "", f)
    return f.strip()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    rows = list(csv.DictReader(open(path)))
    crit = high = 0

    def hdr(t):
        print(f"\n{t}\n{'-' * len(t)}")

    print(f"Auditing {os.path.relpath(path, ROOT)} — {len(rows)} SKUs")

    hdr("1. GTIN check digits")
    bad = [r for r in rows if gtin_valid(r["gtin/barcode"]) is not True]
    for r in bad:
        print(f"  FAIL  {r['gtin/barcode']:<16} {r['flavor']} ({r['sku']})")
    crit += len(bad)
    print(f"  {len(rows) - len(bad)}/{len(rows)} valid" if bad
          else f"  OK — all {len(rows)} pass")

    hdr("2. Duplicate GTINs")
    dupes = {g: n for g, n in
             collections.Counter(r["gtin/barcode"].strip() for r in rows).items() if n > 1}
    for g, n in dupes.items():
        print(f"  {g} x{n}: " + "; ".join(r["flavor"] for r in rows
                                          if r["gtin/barcode"].strip() == g))
    crit += len(dupes)
    if not dupes:
        print("  OK — none")

    hdr("3. SKU code collisions")
    exact = {s: n for s, n in
             collections.Counter(r["sku"].strip() for r in rows).items() if n > 1}
    for s, n in exact.items():
        print(f"  EXACT DUPLICATE  {s} x{n}")
    crit += len(exact)
    stems = collections.defaultdict(list)
    for r in rows:
        m = re.match(r"^([A-Z]+-[A-Z]+)", r["sku"].strip())
        if m:
            stems[m.group(1)].append(r)
    n_stem = 0
    for stem, group in sorted(stems.items()):
        distinct = {base_flavor(g["flavor"]) for g in group}
        if len(distinct) > 1:
            n_stem += 1
            print(f"  STEM '{stem}' -> {len(distinct)} flavours: " +
                  ", ".join(f"{g['sku']}={base_flavor(g['flavor'])}" for g in group))
    high += n_stem
    if not exact and not n_stem:
        print("  OK — none")

    hdr("4. Non-SKU values in the SKU column")
    numeric = [r for r in rows if r["sku"].strip().isdigit()]
    for r in numeric:
        print(f"  '{r['sku']}' <- {r['flavor']}  (looks like a Shopify variant ID)")
    high += len(numeric)
    if not numeric:
        print("  OK — none")

    hdr("5. Invalid hex colours")
    n = 0
    for r in rows:
        for i, tok in enumerate(t.strip() for t in (r["hex spot colors"] or "").split(",")):
            if tok and not HEX_RE.match(tok):
                print(f"  '{tok}'  slot {i+1}  <- {r['flavor']} ({r['sku']})")
                n += 1
    high += n
    if not n:
        print("  OK — none")

    hdr("6. Malformed PMS references")
    n = 0
    for r in rows:
        for i, tok in enumerate(t.strip() for t in (r["pms spot colors"] or "").split(",")):
            if tok and (not tok.startswith("PMS ") or tok == "PMS --"):
                print(f"  '{tok}'  slot {i+1}  <- {r['flavor']} ({r['sku']})")
                n += 1
    print(f"  {n} placeholder/malformed values (low severity)" if n else "  OK — none")

    hdr("7. SKUs with no packaging spec")
    nospec = [r for r in rows if not r["material"].strip()]
    by_type = collections.Counter(r["packaging type"] for r in nospec)
    for t, c in by_type.items():
        print(f"  {t or '(blank)'}: {c} SKUs with no material recorded")
    print(f"  total {len(nospec)}/{len(rows)}" if nospec else "  OK — none")

    hdr("8. Stick packs with no eyemark colour")
    noeye = [r for r in rows
             if r["packaging type"] == "Stick" and not r["eye mark color"].strip()]
    for r in noeye:
        print(f"  {r['sku']:<12} {r['flavor']}  — photo-eye cannot register")
    high += len(noeye)
    if not noeye:
        print("  OK — none")

    print(f"\n{'=' * 60}")
    print(f"Critical: {crit}   High: {high}")
    return 1 if (crit or high) else 0


if __name__ == "__main__":
    sys.exit(main())
