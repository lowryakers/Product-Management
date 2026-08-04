# The code standard — and whether to renumber

Written after reading all 118 existing SKUs and GTINs, not from first principles.
The app enforces this on new codes; the second half answers whether the old ones
should be brought into line.

---

## What the existing codes actually say

### SKU shape

`{PREFIX}-{FLAVOUR}` or `{PREFIX}-{FLAVOUR}-{NN}`

| Line | Format | Prefix | Serial | Count |
|---|---|---|---|---|
| Whey Protein | Pouch | `PP-` | yes, 01–30 | 30 |
| Whey Protein | Stick | `PSP-` | no | 30 |
| Plant Protein | Pouch | `PP-` | yes, 21–24 | 4 |
| Plant Protein | Stick | `PPSS-` | no | 4 |
| Beef Protein | Stick | `HBF-` | no | 4 |
| Beef Protein | Pouch | — | — | 4 (broken, see below) |
| Pancake Mix | Pouch | `PPM-` | no | 4 |
| Crepe Mix | Pouch | `PCM-` | no | 2 |
| Cupcake Mix | Pouch | `PCCM-` | yes, 01–04 | 4 |
| Donut Mix | Box | `PDM-` | yes, 01–26 | 26 |
| Oatmeal Cup | Cup | `POC-` | no | 3 |
| Daily Recharge | Pouch/Stick | `DR-` | no | 2 |
| Gluten Free Flour | Pouch | `GFFB-` | no | 1 |

`PP` was created to mean **Protein Pouch**, not "whey pouch". Plant protein
pouches sitting under `PP-` is therefore correct and intended.

### GTIN shape

Every GTIN is a 12-digit UPC-A: **9-digit GS1 company prefix + 2-digit item
reference + 1 check digit**. Three prefixes are in use, which is 100 numbers each.

| Prefix | Used | Free | Carries |
|---|---|---|---|
| `850046726` | 76 | **24** | most of whey, all of plant, cupcake, crepe, oatmeal, Daily Recharge |
| `850030869` | 23 | 77 | most of donut, some pancake, GF flour |
| `850079939` | 19 | 81 | all of beef, some whey |

All 118 check digits verify. That is genuinely clean and worth keeping that way.

**`850046726` is 76% full.** At the rate new flavours arrive, that block runs out.
The app now shows remaining capacity per prefix and warns below 25 free, and it
allocates from the roomiest prefix a line already uses rather than filling the
tight one further.

### Flavour abbreviations are not a rule

37 of 118 abbreviations do not match plain initials, and **13 of 62 base flavours
carry more than one abbreviation**:

| Flavour | Codes used |
|---|---|
| Salted Caramel | `SC`, `SLC`, `SCR` |
| Double Chocolate | `DCH`, `DC` |
| Birthday Cake | `BD`, `BDC` |
| Blueberry Muffin | `BLM`, `BM` |
| Coconut Cream | `CNC`, `CC` |
| Cookie Crumble | `CC`, `CCR` |
| Chocolate | `CH`, `C` |
| Cinnamon Sugar | `CHU`, `CS` |
| Horchata | `H`, `HO` |
| Key Lime Pie | `KLP`, `KL` |
| Lemon Cake | `LCK`, `LC` |
| Neapolitan | `N`, `NE` |
| Red Velvet | `RDV`, `RV` |

The sharpest case: **`CC` means Cookie Crumble on a whey pouch, Coconut Cream on
a whey stick, and Cheesecake Crumble on a donut box.** Three products, one
abbreviation, in a namespace people read by eye.

Because of this the suggester does not apply a clean rule. It prefers what the
catalogue already says — if the flavour exists anywhere, reuse its abbreviation —
and falls back to initials only for genuinely new flavours. Where the existing
codes disagree with each other, it says so instead of silently picking.

---

## Should the existing SKUs be renumbered?

**Mostly no. Fix eight, freeze the standard, leave the other 110 alone.**

A SKU's only job is to be a stable, unique handle. All 118 already are unique —
there is not one duplicate. Renaming a working key to make a list read more
neatly is how you end up with two truths: the code appears in Shopify, in the
MRP, on POs already sent to PPS, on case and carton labels, and in some cases on
printed film sitting in a warehouse. Every one of those has to change in lockstep
or the join key stops joining, which is the exact failure the audit was about.

That said, three things are genuinely wrong rather than merely untidy.

### 1. The four Beef Protein pouches have no SKU at all — fix these

| Current value | Flavour | GTIN |
|---|---|---|
| `42224277651538` | Cinnamon Sugar | 850079939066 |
| `42224277684306` | Double Chocolate | 850079939080 |
| `42224277717074` | Frosted Vanilla | 850079939073 |
| `42224277749842` | Toffee Cream | 850079939059 |

These are 14-digit Shopify ids pasted into the SKU column. There is no SKU here
to preserve and nothing downstream can be keyed on them meaningfully. Proposed:
`HBP-CHU`, `HBP-DCH`, `HBP-VNL`, `HBP-DDL` — matching the `HBF-` stick codes for
the same four flavours. `HBP` is already in the app's standard table for this
reason.

### 2. Plant pouch serials 21–24 collide with whey — worth fixing, 4 SKUs

`PP-BF-21` (whey Bananas Foster) and `PP-BB-21` (plant Brownie Batter) share a
serial. Same for 22, 23 and 24. If `PP` means Protein Pouch then the serial is
meant to be the unique number within that namespace, and right now it lies.

The full SKU strings are still distinct, so nothing is *broken* — this is the
cheapest of the three to defer. Proposed if you want it clean: renumber the four
plant pouches to `-31` through `-34`, keeping the old code in `legacySku`.

**Already fixed going forward:** the app allocates serials per *prefix*, not per
product line. The next `PP` pouch is `-31` whether it is whey or plant. This
specific collision cannot recur.

### 3. Ambiguous abbreviations — do not renumber, just surface them

`CC` meaning three different flavours is a reading hazard, not a data error, and
renaming three live SKUs to fix a human-legibility problem is not a good trade.
The app warns when a proposed abbreviation already means something else, so the
count stops growing.

### The recommendation in one line

Fix the four beef pouches (they are not SKUs). Optionally renumber the four plant
pouches. Leave the remaining 110. `legacySku` exists on every product for exactly
these cases, so a historic PO or Shopify order still resolves after a change.

None of the eight renames are built — they touch live keys, so they should be a
deliberate decision, not a side effect of shipping the suggester.

---

## How the app uses this

**`/codes`** — start a request, see capacity per GS1 prefix, read the standard.

The suggester (`app/src/lib/codes.ts`) returns three things for every proposal:
the code, the **basis** (why that code), and any **warnings**. All three are shown.
A suggestion that cannot be explained is a suggestion that should not be trusted.

Both codes are validated on write, from either door — the signed-in screen and
the share link go through the same `applySku` / `applyGtin` functions:

- SKU: letters, digits and hyphens, 3–24 characters, not already a product, not
  already claimed by another open request.
- GTIN: 12–14 digits, **check digit must verify**, not already on a product or
  claimed by another request.

**Assignment.** Each half can be assigned to someone with an account, or handed
out as a share link. The link needs no login, is scoped to `SKU`, `GTIN` or
`BOTH`, expires (default 14 days), records who submitted and when, and can be
revoked. Scope is enforced server-side — a `GTIN` field POSTed against a
SKU-scoped link is ignored, not honoured.

**Creating the product.** Only once both codes are set. One button writes the
`Product` row with status `IN_DEVELOPMENT`; the packaging spec is attached after.
