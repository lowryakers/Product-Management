# ProDough Product Management

A recommendation, an audit, and an import-ready dataset for managing ~118 ProDough
SKUs — GTINs, Shopify mapping, packaging specs, artwork versions, NFPs, purchase
orders, and material status — as one person.

Built from the real files in `source/`.

---

## The short version

**You don't have a tooling problem. You have two specific structural problems,
and no tool fixes them for you.**

1. **There is no join key.** Your POs identify products by free text
   (`Description` + `Flavor`), so they cannot be reconciled against your master
   sheet. Five lines across three POs fail to match on spelling alone — one of
   them because "Café Mocha" has an accent and "Cafe Mocha" doesn't. Until every
   artifact hangs off a SKU, nothing can be checked automatically, in any system.

2. **There is no capture path.** Updates arrive as Danny mentioning something in
   passing. If logging that takes more than ten seconds it won't happen, and any
   database you build will be empty by week three.

Fix those two and almost any tool works. Don't fix them and no tool will.

**What this cost you already:** two of three POs carry lines annotated as removed
that are still inside the SUM — **140,000 units and $24,850** on documents signed
by the CEO. On the pancake PO that's 73% of the document's value.

**Recommendation:** build it in Airtable — nine tables, one base, roughly two
hours a week for four weeks. Buy Ziflow later for proofing if that loop still
hurts. Leave formulas in the MRP and commerce in Shopify. Nothing off the shelf
covers your full scope at a price a single operator can own; the closest thing
that does (Specright) is an enterprise implementation, not a purchase.

---

## Read in this order

| Doc | What's in it |
|---|---|
| **[01 — What I found](docs/01-what-i-found.md)** | The audit. The $24,850, the join failures, 65 data issues with SKU-level detail. |
| **[02 — Does this already exist?](docs/02-does-this-already-exist.md)** | Honest landscape: PIMs, Specright, Ziflow, procurement tools, Airtable. What to buy, what to skip, why. |
| **[03 — The system](docs/03-the-system.md)** | Nine tables, every field, the formulas, the views, the automations worth having. |
| **[04 — Rollout](docs/04-rollout.md)** | Four weeks. Capture first, catalogue second, transactions third. How this dies and how to stop it. |

---

## What's here

```
source/     your original files, unmodified
data/       normalized, import-ready CSVs (built from source/)
scripts/    the audit + the dataset builder — rerun these monthly
docs/       the recommendation
```

### `data/` — ready to import into Airtable

| File | Rows | What |
|---|---|---|
| `products.csv` | 118 | the SKU spine |
| `packaging_specs.csv` | 5 | 118 copy-pasted material strings, normalized |
| `sku_colors.csv` | 312 | one row per colour slot, with validity flags |
| `purchase_orders.csv` | 3 | headers, with **as-written vs corrected** totals |
| `po_lines.csv` | 86 | **all 86 joined to a SKU** — the thing your POs can't do |
| `contacts.csv` | 7 | who provides which kind of update |
| `change_log.csv` | 5 | the Inbox, seeded with real findings |
| `data_issues.csv` | 65 | the punch list, by severity |
| `artwork_versions.csv` | 0 | empty schema for the history you've never had |

### `scripts/`

```bash
python3 scripts/audit_master.py    # GTIN check digits, hex, SKU collisions, eyemarks
python3 scripts/audit_pos.py       # PO totals, exclusions, SKU joins, stale footers
python3 scripts/build_dataset.py   # rebuild data/ from source/
```

Requires `openpyxl`. Both audits exit non-zero when they find something, so they
can be scheduled.

---

## Issue tally

| Severity | Count |
|---|---|
| Critical | 8 — PO lines excluded in a note but summed in the total |
| High | 17 — SKU collisions, variant IDs as SKUs, invalid hex, PO number mismatches |
| Medium | 16 — missing colour records, unresolvable specs |
| Low | 24 — `PMS --` placeholders, CMYK values in a PMS field |

Worth stating plainly: **all 118 GTINs pass the GS1 check digit and there are no
duplicates.** That's the most expensive thing to get wrong and it's genuinely well
maintained. The new system's first job is to make sure it stays that way.

---

## Three things to do this week, regardless

1. **Call PPS** about POs 42826 and 43026. $24,850 of exposure on live documents.
2. **Fix the SKU codes** — four beef pouches hold Shopify variant IDs; `PP-CM`
   and `PP-SC` each mean two different flavours; `CC` means Cookie Crumble on
   pouches and Coconut Cream on sticks. Thirty minutes now, or a mispack later.
3. **Pick which master list survives.** Your `artwork-verification` skill expects
   `MASTER ProDough SKU & GTIN List.xlsx`; what you sent is
   `MASTER ProDough Artwork Proofing Sheet`. Two files called "master" is how a
   catalogue silently forks.
