# Does this already exist? (Yes, but not as one thing you can buy)

You asked whether something exists that lets one person run all of this. Short
answer: **the category exists, the software exists, but nothing covers your full
scope at a price and complexity a single operator can own.**

Here is the honest landscape.

---

## What you're actually asking for

Break your list into the six jobs it really is:

| # | Job | Records |
|---|---|---|
| 1 | Product master data — SKU, GTIN, Shopify SKU, status | 118 |
| 2 | Packaging specs — material, dimensions, colours, dielines | 5 specs → 118 SKUs |
| 3 | Artwork lifecycle — versions, FDA copy, NFP, proof rounds, approvals | continuous |
| 4 | Formulas | *lives in your MRP — leave it there* |
| 5 | Purchase orders | ~4/quarter, 86 lines |
| 6 | Material status after ordering | 86 open lines |

Plus the thing underneath all of it: **capturing changes that arrive by text.**

No single product does 1–6. Every vendor covers two or three and assumes you
bought something else for the rest.

---

## Category 1 — PIM (Product Information Management)

Built for job 1, partially 2.

| Product | Fit | Reality |
|---|---|---|
| **Plytix** | Best SMB PIM | Real Shopify sync, digital asset management, cheapest credible PIM. No POs, no packaging specs, no approval workflow. |
| **Sales Layer / Catsy / Jasper** | Similar tier | Same shape, same gaps. |
| **Akeneo** | Open-source edition exists | Powerful, but you are now running software. Community edition needs hosting. |
| **Salsify** | Enterprise | Built for syndicating to Kroger and Amazon. Not your problem yet. |

**Verdict:** covers maybe 30% of your scope, and not the 30% that is hurting.
Your GTIN data is already clean — a PIM's core value is data you have already
got right. Skip for now. Revisit if you start selling into retail and need to
syndicate content to distributor portals.

---

## Category 2 — Packaging specification management

This is the category that actually matches your problem. It is also where the
software gets expensive.

| Product | Fit | Reality |
|---|---|---|
| **Specright** | **Closest single-vendor match in existence** | Specs, SKUs, bills of materials, artwork, suppliers, change control, all keyed on a spec ID. This is genuinely the thing you described. It is an enterprise sale with implementation — annual contract, onboarding project, not a self-serve signup. |
| **Esko WebCenter** | Enterprise packaging lifecycle | Industry standard for large CPG. Heavy implementation. |
| **Loftware / Kallik Veraciti** | Regulated label lifecycle | Built for pharma and medical device audit trails. Far past your needs. |

**Verdict:** Specright is what you would copy if budget were unlimited. Worth a
demo purely to steal the data model — go in, look at how they structure
Spec → SKU → BOM → Artwork → Supplier, and take notes. But it is not a purchase
one VP of Ops makes on a Tuesday, and implementing it is a project, not an
afternoon.

---

## Category 3 — Artwork proofing and review

Built for job 3 only, but genuinely best-in-class at it, and cheap.

| Product | Fit | Reality |
|---|---|---|
| **Ziflow** | **Purpose-built for packaging proofing** | Version stacking, side-by-side compare of v3 vs v4, pinned annotations, timestamped approval trail. Has a free tier. Designed for exactly the you↔Shaun↔PPS loop. |
| **Filestage / Approval Studio** | Comparable | Slightly more generic creative review. |
| **Frame.io** | Video-first | Handles PDFs but built for a different job. |
| **GlobalVision** | **Automated print inspection** | Pixel/text/barcode comparison — catches "the GTIN on the file is not the GTIN in the spec" mechanically. This is the real QA layer for print. Priced accordingly. |
| **Artwork Flow / Twona / ManageArtworks** | Mid-market artwork mgmt | Versioning plus some spec fields. A middle option between Ziflow and Specright. |

**Verdict:** the one category worth buying rather than building. Version history
and an approval trail are hard to fake in a spreadsheet, and "which version did
we actually send to print?" is a question you will eventually need to answer
under pressure.

But **do not buy it first.** Buy it once the SKU spine exists, so proofs attach
to a SKU rather than floating in a folder.

Also relevant: you already have an `artwork-verification` skill on this machine
that checks GTINs, front-of-pack vs NFP consistency, eyemark contrast, and
spelling against a master list. That covers a real slice of what GlobalVision
does. It gets better the moment it points at one clean master instead of two
competing ones.

---

## Category 4 — Procurement / PO systems

| Product | Fit | Reality |
|---|---|---|
| **Procurify / Precoro / Order.co** | Real PO systems | Approval chains, receiving, three-way match, spend analytics. |

**Verdict:** **no.** You have one vendor and roughly four POs a quarter. These
tools solve multi-vendor, multi-approver, high-frequency purchasing. Your PO
problem is not workflow complexity — it is that the document has no SKUs in it
and the total does not respect the notes. That is fixed by generating the PO
from a database, not by buying procurement software.

---

## Category 5 — Ops databases (build it yourself)

| Product | Fit | Reality |
|---|---|---|
| **Airtable** | **Best fit for this shape** | Genuinely relational, forms for capture, automations, Interfaces for dashboards, solid mobile app. Priced per user — and you are mostly one user. |
| **SmartSuite** | Strong alternative | Arguably better workflow and dashboard features, often cheaper. Smaller ecosystem. |
| **Notion** | Popular, wrong tool here | Excellent documents, weak relational integrity, and 118-row grids are unpleasant on a phone. |
| **Smartsheet** | Sheet-centric | Good at POs, poor at product master data. |
| **Baserow / NocoDB** | Open source | Free if self-hosted. You would be running a database server. Not your job. |

**Verdict:** **Airtable.** Not because it is fashionable but because your data is
genuinely relational (SKU → spec, SKU → colours, SKU → artwork versions,
PO → lines → SKU) and Airtable is the only tool in the DIY tier that enforces
those links properly while still being pleasant on a phone.

---

## The recommendation

**Build it in Airtable. Buy Ziflow later if the proofing loop still hurts. Leave
formulas in the MRP. Leave commerce in Shopify.**

| Job | Where it lives | Buy or build |
|---|---|---|
| Product master | Airtable `Products` | build |
| Packaging specs | Airtable `Packaging Specs` | build |
| Colours | Airtable `Colors` | build |
| Artwork versions | Airtable `Artwork Versions` | build |
| Proof rounds with Shaun | Ziflow *(phase 3)* | buy — later |
| Print QA | your `artwork-verification` skill | already have |
| Formulas | MRP *(pointer only in Airtable)* | already have |
| Purchase orders | Airtable `POs` + `PO Lines` | build |
| Material status | Airtable `PO Lines.status` | build |
| Change capture | Airtable `Inbox` + phone form | build |
| Commerce | Shopify | already have |

Rough monthly cost: one Airtable paid seat, plus a second seat only if someone
else edits. Ziflow adds a modest per-user cost later and has a free tier to test
with. Confirm current pricing directly — all of these vendors change tiers often.

Compare that to a Specright-class implementation, which would cover more but
would also become a project you manage instead of a tool that helps you.

---

## The part no tool solves

Every product above assumes information arrives *at the system*. Yours arrives
as Danny mentioning something in a hallway.

If logging that takes longer than about ten seconds, it will not happen, and by
week three you will have an empty database and a full phone again.

**So the capture path matters more than the tool choice.** Whatever you pick has
to have a form you can fill from your home screen in one thumb-swipe. That
requirement, not the feature matrix, is what should decide this — and it is why
a heavyweight enterprise system would actively make things worse for you.
