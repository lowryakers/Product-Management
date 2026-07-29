# The system: nine tables, one base

Everything hangs off `Products.sku`. That single decision is worth more than the
tool choice — it is the thing your current setup does not have.

```
                         ┌──────────────┐
                         │   PRODUCTS   │ ← the spine, 118 records
                         │  sku (key)   │
                         └──────┬───────┘
        ┌───────────┬───────────┼───────────┬────────────┐
        │           │           │           │            │
  ┌─────▼─────┐ ┌───▼────┐ ┌────▼─────┐ ┌───▼─────┐ ┌────▼────┐
  │ PACKAGING │ │ COLORS │ │ ARTWORK  │ │ PO      │ │ INBOX   │
  │   SPECS   │ │        │ │ VERSIONS │ │ LINES   │ │ (change │
  │  5 recs   │ │312 recs│ │          │ │ 86 recs │ │  log)   │
  └───────────┘ └────────┘ └──────────┘ └───┬─────┘ └─────────┘
                                            │
                                    ┌───────▼────────┐
                                    │ PURCHASE ORDERS│ 3 records
                                    └────────────────┘
        FORMULAS (pointer to MRP)   CONTACTS   ← reference tables
```

Import-ready CSVs for all of this are in `data/`, built from your real files.

---

## 1. Products — the spine

One row per sellable SKU. Never delete a row; change `status` instead.

| Field | Type | Note |
|---|---|---|
| `sku` | text, **unique** | primary field |
| `gtin` | text | validated on entry |
| `gtin_valid` | formula | GS1 check digit — see below |
| `product_line` | select | Whey / Beef / Plant / Pancake / Crepe / Cupcake / Donut / Oatmeal / Daily Recharge / GF Flour |
| `format` | select | Pouch / Stick / Box / Cup |
| `flavor`, `base_flavor` | text | `base_flavor` is what joins across formats |
| `spec_id` | link → Packaging Specs | |
| `status` | select | Concept / In Development / Active / On Hold / Discontinued |
| `shopify_sku`, `shopify_variant_id` | text | mapping, not a copy |
| `mrp_formula_id`, `formula_rev` | text | **pointer to the MRP, never a copy** |
| `artwork_version` | lookup | latest approved from Artwork Versions |
| `nfp_version`, `nfp_last_reviewed` | text, date | |
| `eyemark_color` | select | required when `format = Stick` |
| `data_quality_flag` | select | drives the cleanup view |

**Put a real GS1 check-digit formula in the base.** It is the cheapest insurance
you will ever buy, and it turns your best-maintained dataset into one that cannot
regress:

```
IF(
  AND(
    LEN({gtin}) = 12,
    VALUE({gtin}) > 0,
    MOD(
      (VALUE(MID({gtin},1,1)) + VALUE(MID({gtin},3,1)) + VALUE(MID({gtin},5,1)) +
       VALUE(MID({gtin},7,1)) + VALUE(MID({gtin},9,1)) + VALUE(MID({gtin},11,1))) * 3
      + VALUE(MID({gtin},2,1)) + VALUE(MID({gtin},4,1)) + VALUE(MID({gtin},6,1)) +
        VALUE(MID({gtin},8,1)) + VALUE(MID({gtin},10,1)) + VALUE(MID({gtin},12,1)),
      10) = 0
  ),
  "✅", "❌ CHECK DIGIT FAIL"
)
```

### Fix the SKU codes before you import

Do this once, now, while there are only 118. It gets exponentially harder later.

- **Four beef pouches** hold Shopify variant IDs. Assign real codes —
  `HBF-P-CHU`, `HBF-P-DCH`, `HBF-P-DDL`, `HBF-P-VNL` matches the stick convention.
- **`PP-CM`** means both Chocolate Mousse and Café Mocha. **`PP-SC`** means both
  Sugar Cookie and Salted Caramel. Give plant protein its own stem
  (`PLP-*`) so line is encoded in the prefix.
- **`CC` means Cookie Crumble on pouches and Coconut Cream on sticks.** Pick one
  and rename the other.

Keep the old codes in a `legacy_sku` field so historic POs and Shopify orders
still resolve.

---

## 2. Packaging Specs

Five records replace 118 rows of copy-pasted material strings. Change the
material once and every SKU using it updates — which is the entire point.

Fields: `spec_id`, `spec_name`, `format`, `material_structure`, `zipper`,
`print_process`, `trim_length_mm`, `trim_width_mm`, `gusset_mm`,
`front_panel_mm`, `wind_direction`, `core_in`, `vendor`, `last_unit_cost`,
`dieline_required`, `vendor_spec_string`, `notes`.

`vendor_spec_string` is the exact text that prints on the PO footer. Store it
once, here, and let the PO render it — that is how the `SKUs: 21` / `Max OD: ?`
drift stops happening.

Two records (`SPEC-BOX-DONUT`, `SPEC-CUP-OAT`) are deliberately empty. They are
placeholders that make the 29-SKU gap visible instead of invisible.

---

## 3. Colors

One row per SKU per colour slot — 312 records. A separate table rather than a
comma-jammed cell, because that is what lets you validate.

Fields: `sku`, `slot`, `pms`, `hex`, `hex_valid`, `pms_valid`.

`hex_valid` formula: `REGEX_MATCH({hex}, "^(HEX|HX) [0-9A-Fa-f]{6}$")`

That formula alone would have caught `4E2CID`, `F43BF`, `E613B24`, and `HX FF9015`
the day they were typed.

---

## 4. Artwork Versions — the history you have never had

One row per version per SKU. This is the table that answers *"what changed, when,
who approved it, and what did we actually send to print?"*

| Field | Type |
|---|---|
| `sku` | link → Products |
| `version` | text (v1, v2, v3…) |
| `date`, `designer` | date, link → Contacts |
| `stage` | select: Brief → In Design → Internal Review → Revision → Approved → Sent to Vendor → Vendor Proof → **Print Ready** → Printed |
| `change_summary` | long text — *why* this version exists |
| `proof_link`, `print_file_link` | URL (Drive/Dropbox) |
| `gtin_verified`, `nfp_verified`, `eyemark_verified` | checkbox |
| `approved_by`, `approved_date` | link, date |
| `sent_to_vendor_date` | date |

The three checkboxes are your pre-print gate. Nothing reaches `Print Ready` with
one unticked — and they map exactly onto what your `artwork-verification` skill
already checks, so the skill can tick them.

---

## 5 & 6. Purchase Orders + PO Lines

**Purchase Orders** (header): `po_number` (auto-generated, never typed),
`po_date`, `vendor`, `vendor_contact`, `category`, `status`
(Draft → Sent → Acknowledged → In Production → Partially Received → Received →
Closed), `authorized_by`, rollup totals.

**PO Lines** (the important one): `po_number` link, `sku` **link → Products**,
`spec_id`, `qty`, `unit_cost`, `ext_cost`, **`excluded` (checkbox)**,
`exclusion_note`, `line_status`, `expected_date`, `qty_received`,
`date_received`, `qc_status`, `location`.

Three rules that fix everything found in the audit:

1. **`sku` is a link field, not text.** You cannot type "Cafe Mocha" into a link
   field and have it silently miss. You pick from a list or it does not exist.
2. **The header total is a rollup that respects `excluded`.** Tick the box and
   $4,340 leaves the total automatically:
   `SUM(values)` over a `line_total` formula of
   `IF({excluded}, 0, {qty} * {unit_cost})`.
   The $24,850 problem becomes structurally impossible.
3. **`po_number` is generated, never typed.** No more 41626/42826.

### This is your "status of materials after ordering"

`line_status` is the field you said you had no system for. Make it a single
select and view it as a Kanban board:

```
Ordered → Art Approved → Plates/Cylinders Made → In Production
        → Shipped → Received → QC Passed → Stocked
```

Per line, not per PO — because on a 38-line film PO, eight flavours ship while
thirty are still in production, and one number for the whole PO tells you nothing.

---

## 7. Inbox — the most important table

This is where Danny's hallway comment lands. **If this table fails, the whole
system fails**, regardless of how good the rest of the schema is.

| Field | Type |
|---|---|
| `id` | auto |
| `date_logged` | created time (automatic) |
| `source` | link → Contacts (Danny / Shaun / Matt / Michael / Adam / Jake) |
| `channel` | select: Text / Call / In person / Email / Slack |
| `area` | select: Artwork / Formula / Spec / GTIN / PO / Shopify / NFP / New SKU / Other |
| `sku_affected` | link → Products *(optional — leave blank if unsure)* |
| `raw_note` | long text — **exactly what was said, unedited** |
| `decision` | long text — filled during triage, not capture |
| `owner`, `due` | link, date |
| `status` | select: New → Triaged → In Progress → Blocked → Done |
| `priority` | select |

**Design rules, in priority order:**

1. **Capture and triage are separate acts.** Capture takes ten seconds and
   requires no thinking. Triage happens once a day with coffee. Never make
   yourself categorise something while Danny is still talking.
2. **Only `raw_note` is required.** Everything else can be blank. A vague entry
   beats a missing one.
3. **Build an Airtable Form with four fields and save it to your iPhone home
   screen.** Who / area / SKU / what-was-said. Dictate the last one. This is the
   single highest-leverage thing in the entire build.
4. **Never edit `raw_note`.** It is the record of what was actually said. Put
   your interpretation in `decision`. When Danny later says "that's not what I
   told you," the raw note settles it.

Five real items are already seeded in `data/change_log.csv` from the audit.

---

## 8 & 9. Contacts and Formulas

**Contacts** — seven records, seeded in `data/contacts.csv`. Includes a
`provides` field so it is obvious who owns which kind of update.

**Formulas** — **do not rebuild your MRP.** This table holds only
`mrp_formula_id`, `rev`, `effective_date`, `changed_by`, `change_summary`,
`nfp_impact` (checkbox), `artwork_impact` (checkbox).

Those last two checkboxes are the point of the whole table. Matt changes a
formula → does it move the NFP? → does the NFP live on artwork? → then artwork is
now stale and the film you have in stock may be obsolete. That chain currently
exists only in your head, and it is the most expensive chain in the business:
a formula tweak can silently invalidate 1.9 million printed sticks.

---

## Views to build (this is where the daily value is)

| View | Table | Type | Purpose |
|---|---|---|---|
| **Today** | Inbox | grid, filtered `status ≠ Done` | first thing you open |
| **Triage** | Inbox | grid, `status = New` | the daily ten minutes |
| **SKU Card** | Products | Interface detail | one product, everything, on a phone |
| **PO Tracker** | PO Lines | **Kanban by `line_status`** | material status at a glance |
| **Artwork Board** | Artwork Versions | **Kanban by `stage`** | where every proof is |
| **Data Health** | Products | grid, filtered to failures | the cleanup queue, drains to zero |
| **Print Ready Gate** | Artwork Versions | filtered, 3 checkboxes unticked | nothing goes to print unchecked |
| **Receiving** | PO Lines | `line_status = Shipped` | what Jake should expect |

---

## Automations worth having (and the ones to skip)

**Worth it:**

- Inbox form submitted → push/Slack to you. Closes the loop so you trust it.
- `line_status` → `Received` → create a QC task for Maria, notify Jake.
- Artwork `stage` → `Approved` → notify Adam and Jake that film can be ordered.
- Monday 7am digest: open inbox items, POs in production, artwork awaiting you.
- Any `gtin_valid = ❌` → alert immediately.

**Skip at first:** Shopify two-way sync, MRP integration, automated PO emails to
PPS. Every integration is a thing that breaks quietly. Earn them once the base is
load-bearing.

---

## What good looks like in six weeks

Danny mentions in passing that Blueberry Muffin's front panel needs the protein
call-out bumped from 24g to 25g.

**Today:** you remember it, or you don't.

**In six weeks:** two thumb-taps into the form — *Danny / Artwork / PP-BLM-23 /
"bump protein callout 24→25g front panel."* At triage you link it to Matt's
formula rev, tick `nfp_impact`, and it auto-appears on the Artwork Board as a new
version for Shaun. When the proof returns, the three verification boxes gate it.
When you cut the next film PO, the line pulls the approved artwork version — and
the system flags that 63,000 stick films with the old panel are still in stock.

That last flag is the one you cannot currently get at any price, and it is worth
more than everything else in this document.
