# What I found in your current files

I ran an automated audit over the master artwork sheet (118 SKUs) and the three
PPS purchase orders. The point of this section is not to criticise the
spreadsheets — it is to show which failures are *structural*, because those are
the ones a new system has to prevent by design rather than by care.

Reproduce any of this with `python3 scripts/audit_master.py` and
`python3 scripts/audit_pos.py`.

---

## The one that costs money

**Two of your three POs are overstated because "removed" lines are still inside the SUM.**

Lines that were annotated as pulled were never actually deleted, and the total
row sums the whole range regardless of the note in column I.

| PO | As written | Excluded lines | Corrected |
|---|---|---|---|
| 42826 — Stick Film | 1,993,600 u / $149,320.64 | 4 × plant film, "moved quantity to other flavors" | 1,893,600 u / **$141,830.64** |
| 43026 — Mix Pouch | 55,000 u / $23,870.00 | 4 × pancake pouch, "leaving off this PO" | 15,000 u / **$6,510.00** |
| 41726 — Protein Pouch | 93,000 u / $47,058.00 | none | 93,000 u / $47,058.00 |

**Combined: 140,000 units and $24,850 of exposure** sitting in documents signed
"Authorized By: Daniel Augustyn CEO".

On the pancake PO the discrepancy is not a rounding error — it is **73% of the
document's value**. If PPS worked from the total rather than reading the notes,
you either receive 40,000 pouches you did not want or you argue about an invoice.

This is the strongest argument for changing systems. A note in a cell is a
message to a human. A checkbox that a formula respects is a control.

---

## The structural flaw: there is no join key

Your PO lines identify products with free text — `Description` + `Flavor` — and
nothing else. No SKU, no GTIN. So the POs and the master sheet cannot be
mechanically reconciled, which means nothing can be automatically checked.

When I tried to join the 86 PO lines to the 118 master SKUs, five broke on
spelling alone:

| On the PO | In the master | Failure |
|---|---|---|
| `Raspberry Cheescake` | Raspberry Cheesecake | typo |
| `Snickerdoodle Cookie` | Snickerdoodle | extra word |
| `Cafe Mocha` | Café Mocha | **accented character** |
| `GF Flour` | Gluten Free Flour | abbreviation |

The Café Mocha one is worth dwelling on. A single `é` is enough to make a
product invisible to any lookup you write. No amount of discipline fixes that
class of bug — only a real key does. Once I keyed the lines on SKU, all 86
matched, and that file is now `data/po_lines.csv`.

**Consequences you cannot currently see, but the joined data can:**

- **Pomegranate Acai (PP-PA-30)** is on the film PO for 55,000 sticks but has
  **no pouch on the pouch PO**. Either deliberate or a miss — with joined data
  it is a one-line query instead of an accident discovered at fill time.

---

## Document hygiene

**PO numbers disagree with their own file names on 2 of 3 POs.**

| File name says | Sheet cell F15 says | PO date field |
|---|---|---|
| `PO_41626` | `#42826` | 2026-04-28 |
| `PO_42926` | `#41726` | 2026-04-28 |
| `PO_43026` | `#43026` ✓ | 2026-04-28 |

**These are date codes, not arbitrary numbers.** `42826` is 4/28/26, `41626` is
4/16/26, `41726` is 4/17/26, `43026` is 4/30/26 — MMDDYY throughout.

So the problem is not typing errors, it is that the number is a date stamped at
one moment and the document keeps living afterwards. The film PO's number matches
its PO date; its file name is frozen at the draft date twelve days earlier. The
protein pouch PO matches *neither* — number from 4/17, file name from 4/29, date
field 4/28.

The fix follows from that: **derive the number from the date the PO is actually
sent, set it once at send time, and generate the file name from the record** so
the two can never disagree. Same-day collisions get a letter suffix (`42826A`,
`42826B`).

Until then, when you email PPS about "PO 41626," nobody knows which document you
mean.

**The film PO footer says `SKUs: 21`. The PO has 38 line items.** The footer was
written once and never updated. Static text inside a document that describes the
document will always drift.

**One spec, described two different ways:**

- Master sheet: `#781 PET Soft Touch on #858 COS Web metallocene`
- Film PO footer: `.50ga Soft Touch Matte PET/280ga White Stickweb`

Probably the same material. "Probably" is not good enough on a $141,830 order.
Also `Max OD: ?` has been shipped to a vendor with a literal question mark in it.

---

## Master sheet data quality

The good news first, because it matters:

**All 118 GTINs pass the GS1 check digit, and there are no duplicates.** That is
genuinely well maintained and it is the single most expensive thing to get wrong.
Whatever you build must protect this.

The problems:

**4 SKUs have a Shopify variant ID where the SKU code should be.** The beef
protein pouches read `42224277651538`, `42224277684306`, `42224277717074`,
`42224277749842`. Their stick siblings are correctly coded `HBF-CHU`, `HBF-DCH`,
`HBF-DDL`, `HBF-VNL`. These four need real codes.

**6 SKUs carry hex values that are not valid hex** — they cannot be rendered by
any software:

| Value | SKUs | Likely intended |
|---|---|---|
| `HEX 4E2CID` | PP-CM-02, PSP-CM | `4E2C1D` — letter I for digit 1 |
| `HEX F43BF` | PP-RC-12, PSP-RC | `F4E3BF` — 5 chars, missing one |
| `HEX E613B24` | PP-BF-21, PSP-BF | 7 chars — unclear |

Also `HX FF9015` (Orange Cream, missing the E) and `PNS 9160 C` (Iced Mocha,
PNS for PMS).

**SKU stem collisions.** Two stems point at different flavours:

- `PP-CM` → **PP-CM-02** Chocolate Mousse *and* **PP-CM-23** Café Mocha
- `PP-SC` → **PP-SC-18** Sugar Cookie *and* **PP-SC-22** Salted Caramel

Only the numeric suffix disambiguates them. Anyone who abbreviates in a text
message — and everyone does — can pick the wrong one.

There is a worse cross-format version. On pouches `CC` means Cookie Crumble
(PP-CC-04) and Coconut Cream is `CNC`. On sticks `CC` means **Coconut Cream**
(PSP-CC) and Cookie Crumble is `CCR`. The same two letters mean opposite
products depending on format.

**29 SKUs have no packaging spec at all** — all 26 donut mix cartons and all 3
oatmeal cups. That is 25% of the catalogue with no recorded material, dimension,
or print spec.

**24 colour slots are `PMS --` placeholders**, and 14 SKUs have no colour
record whatsoever (Daily Recharge, GF Flour, oatmeal cups, and the 7 licensed
donut mixes).

**One stick pack has no eyemark colour** — Daily Recharge Stick (DR-SP). Every
other stick specifies black or white. Without it the bagger's photo-eye runs blind.

---

## You already have two different "master" lists

The `artwork-verification` skill on this machine expects a file called
**`MASTER ProDough SKU & GTIN List.xlsx`** with tabs for Shopify Full List,
Protein Powder, Pancakes Crepes Cupcakes, Daily Recharge, GF Flour, Oatmeal Cups,
Protein Donut Mix, and Misc.

What you sent me is **`MASTER ProDough Artwork Proofing Sheet`** — a flat CSV
with a different shape.

Two files both called "master" is how a catalogue silently forks. Whichever one
you keep, the other has to become a generated view of it.

---

## Tally

| Severity | Count | What |
|---|---|---|
| Critical | 8 | PO lines excluded in a note but summed in the total |
| High | 17 | SKU stem collisions, variant IDs as SKUs, invalid hex, PO number mismatches, missing eyemark |
| Medium | 16 | Missing colour records, unresolvable specs |
| Low | 24 | `PMS --` placeholders, CMYK values in a PMS field |

Full list with SKU-level detail: `data/data_issues.csv`.

Every one of these is a validation rule that a database enforces at entry and a
spreadsheet cannot. That is the actual argument for moving.
