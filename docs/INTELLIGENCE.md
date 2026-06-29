# Padho Label — Product Intelligence

How Padho turns a scanned or browsed product into a personalised verdict, how the
catalog heals itself, and how to grow it. This is the “brain” the smart-shopping
experience sits on.

> TL;DR — the intelligence is a **pre-scored product catalog with a thin query
> layer**. It stores the *objective inputs* of a score (per-100g nutrition,
> ingredients, additives); the rating engine personalises the verdict at runtime.
> Resolution is **local-first** and **self-healing**: any slow-path lookup is written
> back so it never runs twice. There is no backend — the device owns its data, and
> the shared catalog grows through a maintainer-promoted contribution queue.

---

## 1. What it stores (and what it doesn’t)

The unit is a **canonical product record** (`RawProduct` → indexed as `IntelRecord`):

- **Identity:** `barcode`/`gtin`, `brand`, `name`, `quantity`.
- **Objective score inputs:** per-100g `nutrition`, `ingredients`, `nova_group`,
  `subCategory`.
- **Provenance:** `source` (`seed` | `airtable` | `off` | `ocr` | `contribution`),
  `confidence`, `verifiedAt`.

It deliberately does **not** store the personalised 0–100 score. That is computed
live from the user’s `HealthConstraints` (`ratingEngine.calculatePersonalizedScore`),
so the same record serves a diabetic and a bodybuilder differently with zero extra
storage — and **no health profile ever enters the catalog** (PII stays on-device).

### Match keys (single source of truth)

`intelligence/normalize.ts` derives every key. The app and the build pipeline both
route through it, so keys never drift:

| Key | Made of | Used for |
|---|---|---|
| `gtin` | normalised barcode | exact, deterministic match |
| `matchKey` | `brand \| name \| qty` | exact SKU identity |
| `lineKey` | `brand \| name` | **pack-independent** match (75 g and 200 g share per-100g nutrition) |

---

## 2. Resolution waterfall (`intelligence/match.ts`, `resolve.ts`)

A scanned barcode (or a browse query) runs the rungs in order of decreasing certainty:

```
0. LOCAL intelligence (seed + self-healed learned cache)   ← offline, instant
     1. barcode / GTIN          exact
     2. brand + name + qty      exact SKU
     3. brand + name            same product, different pack (per-100g identical)
     4. fuzzy (same brand)      token similarity, ONLY if unambiguous → low confidence
1. Airtable curated catalog (optional, your authoritative D2C/new SKUs)
2. Open Food Facts live API     world → in.openfoodfacts → v0     (cacheable)
3. OCR the physical label       the real fix for India’s long tail (your data)
   else → "not yet rated": show objective facts, never guess, queue backfill
```

**Trust rule:** an ambiguous fuzzy match is treated as a **miss**. In a health
product a confident *wrong* score is worse than honestly returning nothing.

**Self-heal:** every external resolution (OFF / OCR) calls `remember()` — the product
becomes a permanent tier-0 learned record in `AsyncStorage`, so **the fallback never
runs twice on that device** — and `enqueueContribution()` to grow the shared catalog.

---

## 3. Two growth loops

| Loop | Trigger | Effect |
|---|---|---|
| **Device self-heal** (per-user, instant) | OFF/OCR resolution | `remember()` → learned cache; next lookup is a tier-0/1 hit |
| **Shared backfill** (“update the repository”) | maintainer | export queue → `npm run promote` → `npm run build:catalog` → bundled for everyone next release |

This is the no-backend way the catalog closes Open Food Facts’ thin-India gap over
time. The most valuable contributions are **OCR-origin** rows — they fill exactly the
SKUs no database has.

---

## 4. Data sources (researched June 2026)

**Seed + the only cacheable enrichment: Open Food Facts (ODbL).** It is the only
source that is simultaneously free, openly licensed for caching/derivation/commercial
use, and exposes real per-100g nutrition + ingredients keyed by barcode.

> ⚠️ **OFF-India is thin** — ~21,700 India SKUs (mid-2026), skewed to big brands, often
> with incomplete nutrition. Ship it as a **head start, not full coverage**. OCR +
> contributions are the actual coverage engine.

| Source | Role | Cacheable into shared catalog? |
|---|---|---|
| **Open Food Facts** (dump for seed, API for enrich) | seed + enrich | ✅ ODbL — attribute + keep source-tagged |
| **OCR of the physical label** (OCR.space) | enrich (long-tail fix) | ✅ your own data, unencumbered |
| **Airtable curated catalog** | seed (D2C/new SKUs) | ✅ your own data, wins ties |
| **FSSAI / Codex GSFA additive facts** | reference (additive flags) | ✅ facts aren’t copyrightable (see `additivesService.ts`) |
| USDA FoodData Central | — | ✅ CC0 but ~empty for India |
| GS1 India DataKart | barcode (authoritative 890-prefix) | ❌ paid/gated, no public API, no cache rights |
| FatSecret / Edamam / Spoonacular / Nutritionix | — | ❌ ToS forbid persisting into a shared catalog |
| Blinkit/Zepto/Instamart/Amazon/BigBasket PDPs | — | ❌ scraping prohibited + blocked; nutrition is in images |

### License discipline (ODbL — get this right)

- **Attribution is mandatory** wherever OFF data surfaces:
  *“Contains information from Open Food Facts, made available under the Open Database
  License (ODbL).”* Put it in the app About screen and on result screens using
  OFF-derived data.
- **Share-alike binds the derived *database*, not your app.** Your screens and scores
  are a “Produced Work” and are exempt; share-alike only triggers if you *publicly
  distribute the derived database itself* (e.g. publish the OFF-derived catalog slice).
  Keep OFF-origin rows `source`-tagged and detachable so they never irreversibly merge
  into a proprietary table.
- The `promote` step must only accept `source ∈ {ocr, off, contribution, airtable}` so
  no no-cache source ever leaks into the shared catalog.

---

## 5. Build pipeline — how to update the repository

```
scripts/sources/*.json   ──build:catalog──▶  src/services/intelligence/seed.ts  ──▶ bundled
        ▲                                                                            in the app
        └── promote ── exported device contribution queue
```

**Add or correct a product / category:**
1. Edit (or add) a row in `scripts/sources/seed.raw.json` (or any `scripts/sources/*.json`).
   Only `name` + `nutrition` are required; `subCategory` is derived if omitted.
2. `npm run build:catalog` — regenerates `seed.ts` (sorted, de-duped). Match keys are
   **not** written here; the app derives them at load time (one source of truth).
3. Commit `scripts/sources/*.json` + the regenerated `seed.ts`.

**Promote device-discovered products into the shared catalog:**
1. Export a device’s contribution queue to a JSON file (`exportContributions()`).
2. `npm run promote path/to/contributions.json` → merges into `scripts/sources/contributed.json`.
3. `npm run build:catalog` → regenerates `seed.ts`. Commit both.

**Pulling a fresh OFF-India slice (recommended cadence: monthly):** download the OFF
Parquet/JSONL dump (HuggingFace `openfoodfacts/product-database`), filter
`countries_tags` contains `en:india`, drop rows without usable nutrition, select the
scoring fields, write to `scripts/sources/off-india.json`, then `npm run build:catalog`.
Do this **offline from the dump** — never bulk-query the live API. Cap the bundle to a
few thousand high-traffic rows; the rest are fetched + cached live on demand.

---

## 6. Where Swiggy fits (for context)

The Swiggy Instamart MCP is a **per-user transaction rail, not a data source** — it
needs each user’s delegated OAuth token, has no pincode read parameter, and returns no
nutrition/ingredients. So the intelligence is built entirely from the sources above and
is **Swiggy-independent**; Swiggy is touched only at the buy moment (deep-link today,
delegated in-app checkout once production access is granted). See the brainstorm thread
for the full reasoning.

---

## 7. Module map

| File | Responsibility |
|---|---|
| `normalize.ts` | pure key derivation (barcode, brand, name, qty, similarity) |
| `match.ts` | the resolution waterfall over an index (pure) |
| `rank.ts` | personalised ranking + decisive axis (compare/decide) |
| `seed.ts` | **generated** bundled base catalog |
| `store.ts` | seed + learned cache, `remember()` self-heal, category queries |
| `contributions.ts` | PII-free contribution queue (export/promote) |
| `resolve.ts` | public entry: `resolveByBarcode`, `rememberProduct` |
| `scripts/build-catalog.mjs` | sources → `seed.ts` |
| `scripts/promote-contributions.mjs` | exported queue → `scripts/sources/contributed.json` |

## 8. Verification

```bash
node_modules/.bin/tsc --noEmit   # types (clean)
npm test                         # 41 tests — normalize, waterfall, ranking, self-heal
npm run build:catalog            # regenerate the seed
```

Device QA (camera + OCR) requires a real Android build via the GitHub Actions pipeline.
