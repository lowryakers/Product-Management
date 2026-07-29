# How it works, end to end

Companion to the schema in [03 — The system](03-the-system.md). That doc is the
skeleton; this is the motion.

---

## The whole thing in one paragraph

Everything that happens to a ProDough product enters through **one door** — the
Inbox — and leaves through **one gate** — artwork marked `Print Ready`. In
between, every record hangs off a SKU, so the system can always answer the two
questions you currently answer from memory:

1. **What does this change affect?**
2. **What have we already bought that it invalidates?**

The nine tables are plumbing. If you understand the door and the gate, you
understand the system.

---

## Who actually logs in

This is usually what kills a system like this, so settle it first: **nobody has
to change how they work with you.**

| Person | Logs in? | How they interact |
|---|---|---|
| **You** | Yes — sole editor | Capture, triage, everything |
| Danny | No | Talks to you. You log it. |
| Shaun (design) | No | Sends files. You log the version + Drive link. |
| Matt (formulation) | No | MRP stays his. You mirror a `formula_rev` pointer. |
| Michael Rino (PPS) | No | Receives a generated PO PDF, replies as always. |
| Jake, Adam | Read-only, month 2 | Jake eventually updates receiving. |

You need zero buy-in to start. That's why Week 1 is a single table.

---

## The heartbeat: capture, then triage

Runs daily. It's the only habit the system asks of you, and **the two halves must
stay separate** — capture happens at Danny's speed, triage at yours.

**Capture — 10 seconds, no thinking.** Four fields on your home screen:

```
Who    : Danny
Area   : Artwork
SKU    : (optional — leave blank if unsure)
Said   : "bump the protein callout on blueberry muffin from 24 to 25 on the front"
```

Only the last field is required. You are still standing in the hallway.

**Triage — 10 minutes, once a day.** Open the `New` view. Per item:

- Link the real SKU **and its siblings**. "Blueberry Muffin" is `PSP-BM` *and*
  `PP-BLM-23`.
- Write the `decision` — your interpretation, in your words.
- Set owner and due date. Mark `Triaged`.

Never make yourself categorise something while Danny is still talking. That
friction is what kills capture, and capture is the whole system.

---

## Journey A — Danny asks for a change

The most common thing that happens to you.

| Who | Step | Table |
|---|---|---|
| Danny | Mentions Blueberry Muffin's front panel should read 25g, not 24g | — |
| **You** | Two taps, dictate the note | `Inbox` → `New` |
| **You** | Triage: link **both** `PSP-BM` and `PP-BLM-23` | `Inbox → Products` |
| *Auto* | **Shows what's already bought:** `PSP-BM` 63,000 films / $4,718.70 (PO 42826), `PP-BLM-23` 5,000 pouches / $2,530 (PO 41726) | `PO Lines` |
| **Decision** | Run out the 63,000 old films, or eat them? Recorded in `decision`. | `Inbox` |
| **You** | Brief Shaun. Create v4 per SKU with a change summary. | `Artwork Versions` |
| Shaun | Sends proof. You log the link → `Internal Review` | `Artwork Versions` |
| **Gate** | GTIN ✓ NFP ✓ eyemark ✓ — `PSP-BM` is a stick, so eyemark is mandatory (spec says white) | → `Print Ready` |
| *Auto* | Adam + Jake notified film can be ordered. Inbox item closes. | — |

**What changed:** step 4. The system telling you 63,000 films are already on
order is the thing you cannot currently get at any price. It turns a casual
request into a costed decision *before* you spend anything.

---

## Journey B — Matt changes a formula

The expensive one, because the cascade is invisible today.

| Who | Step | Table |
|---|---|---|
| Matt | Changes the formula in the MRP, mentions it | — |
| **You** | Capture. Area = Formula. | `Inbox` |
| **You** | Bump `formula_rev`. Tick: **does this move the NFP?** and **does the NFP print on artwork?** | `Formulas` *(pointer only — the formula never leaves the MRP)* |
| *Auto* | **Blast radius.** "Double Chocolate" is five SKUs: `PP-DCH-25`, `PSP-DC`, `HBF-DCH`, the beef pouch, `PDM-DC-15` | `Products` on `base_flavor` |
| **Decision** | Which five actually use the changed formula? Probably the two whey SKUs — but now you're deciding deliberately. | — |
| *Auto* | NFP moves → new `nfp_version` per SKU → prints on pack → new Artwork Version per SKU → each runs the gate | `Products → Artwork Versions` |

### Why this chain justifies the build

A change to the **whey base itself** — not one flavour — touches **60 SKUs**.
You currently have **1,668,100 whey stick films** open on PO 42826.

If that change moves the NFP and the NFP prints on pack, every one of those films
is obsolete the moment Matt commits it. That chain exists today only in your head,
and it's the most expensive chain in the business.

---

## Journey C — a new flavour, concept to shelf

~12 weeks, most of it waiting on other people. The system's job is making sure
nothing is skipped.

| Who | Step | Table |
|---|---|---|
| Danny | "Cookies & Cream in whey, both formats" | — |
| **You** | Create **two** Products, status `Concept`. No GTIN, no SKU yet. | `Products` |
| Matt | Formulates. Record MRP id + rev → `In Development`. | `Formulas → Products` |
| **You** | Assign GTINs from the GS1 pool and SKU codes. Check-digit formula validates on paste — a typo can't reach artwork. | `Products` |
| *Auto* | Link `SPEC-POUCH-LG` + `SPEC-STICK-LG`. Material, dims, zipper, wind, cost all inherited — no vendor conversation needed. | `Packaging Specs` |
| **You** | Brief Shaun. v1 per SKU; rounds as v2, v3, each with a change summary. | `Artwork Versions` |
| **Gate** | Three checkboxes → `Print Ready`. **Until this passes the SKU cannot appear on a PO.** | — |
| **You** | Add to next PO. Status → `Active`, map Shopify SKU. | `PO Lines · Products` |

**The catch this prevents:** `PP-PA-30` Pomegranate Acai currently has 55,000
stick films on PO 42826 and **no pouch on the pouch PO**. Deliberate or a miss —
you can't tell. With SKUs on both sides it's a one-line query, not a discovery at
fill time.

---

## Journey D — a PO, draft to stocked

| Who | Step | Table |
|---|---|---|
| **You** | Filter Products: `Active` **and** artwork `Print Ready`. That's what's eligible. | `Products` |
| **You** | Create PO. Add lines by **picking SKUs from a list** — not typing flavour names. You can't type "Cafe Mocha" and have it silently miss. | `Purchase Orders · PO Lines` |
| *Auto* | `spec_id` and `unit_cost` pull from the spec. `po_number` generates itself. | — |
| **You** | Change your mind on four plant flavours — **tick `excluded`** | `PO Lines` |
| *Auto* | **$7,490 leaves the total.** The rollup only sums lines where `excluded` is false. The line stays visible with its note; the money doesn't. **This is the $24,850 fix.** | — |
| *Auto* | Generate the PDF. Footer spec pulls from Packaging Specs; SKU count is a live rollup — it can never say `SKUs: 21` on a 38-line PO, and `Max OD: ?` is a blank field you must fill, not text you forget. | — |
| Michael/PPS | Receives the PDF exactly as today. Confirms → `Acknowledged`. | — |
| **You** | Advance `line_status` **per line** — on a 38-line PO, eight flavours ship while thirty are still in production. | `PO Lines` Kanban |
| Jake | Enters `qty_received`. Variance against ordered qty flags automatically. | `PO Lines` |
| Maria | QC → `Stocked`. | `PO Lines` |

`Ordered → Art Approved → Plates Made → In Production → Shipped → Received → QC Passed → Stocked`

---

## The loop that closes

This is what makes it a system rather than four separate trackers:

**The last step of Journey D feeds the fourth step of Journey A.**

Stocked material is exactly what makes an artwork change expensive. Once
`PSP-BM`'s 63,000 films are marked `Stocked`, the next time Danny asks to change
that panel the system says so *before* you brief Shaun — not after you've paid for
a new plate.

| Question | Answered by | Today |
|---|---|---|
| What did Danny actually ask for? | Inbox `raw_note` | text thread |
| Which SKUs does this touch? | Products on `base_flavor` | memory |
| What have we already bought? | PO Lines `line_status` | nothing |
| Which version is on press? | Artwork Versions | nothing |
| Does this formula change break artwork? | Formulas `nfp_impact` | memory |
| What's the real PO total? | rollup on `excluded` | wrong by $24,850 |

---

## What a normal week costs

Once running — not during the four-week build.

| When | What | Time |
|---|---|---|
| Daily | Capture as it happens | ~10s × 4–6 items |
| Mornings | Triage the `New` view to empty | 10 min |
| Monday | Read the 7am digest, reprioritise | 5 min |
| As needed | Advance PO lines, log artwork versions | event-driven |
| Monthly | Export Products, run both audit scripts | 10 min |

**Roughly 15 minutes a day.** Against which you stop scrolling text threads to
reconstruct what was decided, and stop discovering conflicts at fill time.

On the monthly audit: if it comes back clean the validation rules are holding. If
issues reappear, a rule is missing — **add the rule rather than fixing rows by
hand.**

---

## Automatic vs. you

Over-promising automation is how people lose trust in a system in week two. So:

| The system does | You do |
|---|---|
| Validates GTIN check digits and hex on entry | Type the value once |
| Totals POs respecting `excluded` | Tick the box |
| Generates PO numbers and the PDF | Pick SKUs and quantities |
| Shows every SKU sharing a base flavour | **Decide which are genuinely affected** |
| Shows what's on order and stocked | **Decide run-out vs. scrap** |
| Blocks `Print Ready` until three boxes are ticked | Actually verify, then tick |
| Notifies Adam and Jake on approval | — |
| Sends the Monday digest | Read it |

The pattern: **the system surfaces, you decide.** It never guesses which SKUs a
formula change affects or whether to scrap film — those are judgement calls with
money attached. What it does is make sure the judgement call gets put in front of
you, with the numbers already attached, before you've spent anything.
