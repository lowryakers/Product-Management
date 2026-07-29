# Rollout: four weeks, roughly two hours a week

The failure mode for a project like this is building all nine tables, loving it
for eleven days, and abandoning it. So the order below is deliberate: **capture
first, catalogue second, transactions third, polish last.**

If you only ever finish Week 1, you will still be meaningfully better off. That
is the test of a good sequence.

---

## Week 0 — decide (30 minutes)

Three decisions to make before touching software. Everything downstream depends
on them.

1. **Which master list survives?** The `MASTER ProDough SKU & GTIN List.xlsx`
   that your `artwork-verification` skill expects, or the flat
   `MASTER ProDough Artwork Proofing Sheet`? Airtable becomes the source of
   truth and the other becomes a generated export. Pick one to retire.
2. **Fix the SKU codes.** The four beef pouches with Shopify variant IDs, the
   `PP-CM` / `PP-SC` collisions, and the `CC` cross-format reversal. Thirty
   minutes now, or a mispack later. Keep `legacy_sku` so history resolves.
3. **Confirm the two overstated POs with PPS.** Independent of any system work,
   there is $24,850 across two live documents that needs a phone call this week.

---

## Week 1 — the Inbox only

**Build nothing else.** One table, one form, one habit.

- Create the Airtable base. Build **only** the `Inbox` table.
- Build the form: Who / Area / SKU (optional, free text for now) / What was said.
- Save it to your iPhone home screen. Name it something one-syllable.
- Import the five seeded items from `data/change_log.csv`.
- **Log every single thing for seven days.** Even the ones you are sure you will
  remember. Especially those.
- Ten minutes each morning: triage `New` → set owner, due, decision.

**Why alone:** if the capture habit does not take, nothing else matters, and you
will have spent one hour finding that out instead of twenty. If it does take,
you have already solved the problem you described as feeling underwater.

**Success test at day 7:** more than fifteen entries, and you have stopped
scrolling text threads to remember what Danny asked for.

---

## Week 2 — the catalogue

Now the SKU spine, so inbox items can link to real products.

- Import `data/packaging_specs.csv` (5 records — do this first, Products links to it).
- Import `data/products.csv` (118 records).
- Import `data/sku_colors.csv` (312 records).
- Import `data/contacts.csv` (7 records).
- Add the GS1 check-digit formula and the hex validation formula.
- Convert `Inbox.sku_affected` from text to a link field pointing at Products.
- Build the **Data Health** view and import `data/data_issues.csv` as a
  punch list.

**Then work the punch list down.** 65 issues, most of them thirty seconds each.
Start with the 8 Critical and 17 High. Send Shaun the six invalid hex values in
one message rather than six.

**Success test:** you can pull up any SKU on your phone and see its GTIN, spec,
colours, and open changes.

---

## Week 3 — POs and material status

- Import `data/purchase_orders.csv` and `data/po_lines.csv` (86 lines, already
  keyed to SKUs).
- Make `PO Lines.sku` a **link** to Products. This is the fix for the whole
  free-text problem.
- Add the `excluded` checkbox and the rollup that respects it. Verify PO 43026
  now reads $6,510 and not $23,870 — that is your proof the control works.
- Set `line_status` on all 86 open lines to reality as of today.
- Build the **PO Tracker** Kanban.
- Set `po_number` to auto-generate.

**Success test:** you can answer "where is the Bananas Foster film?" in under
five seconds without texting anyone.

---

## Week 4 — artwork and polish

- Build the `Artwork Versions` table (empty schema is in
  `data/artwork_versions.csv`).
- Backfill only **currently-active artwork** — one row per SKU at its live
  version. Do **not** try to reconstruct history; it is not worth it and you
  will stall out here.
- Build the **Artwork Board** Kanban and the **Print Ready Gate** view.
- Add the Monday digest automation.
- Point your `artwork-verification` skill at the Airtable export instead of the
  old spreadsheet.
- Build the **SKU Card** Interface for phone use.

**Success test:** Shaun sends a proof, you log it as a version, the three
verification boxes gate it, and it reaches Print Ready with an audit trail.

---

## Later, only if the pain is real

- **Ziflow** for proofing rounds — once you have felt the annotation pain enough
  times to know you want it.
- **Shopify sync** — once the SKU mapping is complete and trusted.
- **MRP integration** — probably never. A `formula_rev` pointer is enough.
- **Specright** — if you outgrow this. Book a demo before then anyway, just to
  study the data model.

---

## How this dies, and how to stop it

Four honest failure modes, in the order they are likely to bite:

| Failure | Signal | Prevention |
|---|---|---|
| **Capture friction** | Inbox stops growing by week 3 | Form on the home screen, four fields, `raw_note` the only required one. Guard this ruthlessly. |
| **Over-modelling** | You add a tenth and eleventh table in month two | Nine tables. New field only when a real question needs it. |
| **Two sources of truth** | Someone still edits the old Google Sheet | Delete it, or rename it `ARCHIVED — do not edit`. Do this the day you finish Week 2. |
| **Solo-system decay** | Only you ever open it | Give Jake and Adam read access in month two. Being observed keeps it current. |

The one to actually worry about is the first. The other three are recoverable.

---

## Rerunning the audit

The audit scripts stay useful — they are your regression test:

```bash
python3 scripts/audit_master.py    # GTIN check digits, hex, SKU collisions
python3 scripts/audit_pos.py       # PO totals, exclusions, SKU joins
python3 scripts/build_dataset.py   # rebuild data/ from source/
```

Export Products from Airtable to `source/master_artwork_sheet.csv` monthly and
run `audit_master.py`. If it stays clean, the validation rules are doing their
job. If issues reappear, a rule is missing — add it rather than fixing the rows
by hand.
