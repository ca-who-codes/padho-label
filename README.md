# Padho Label 🥗

**Scan any packaged product — know instantly whether it's good for *your* body, and why.**

Padho Label ("padho" = *read* in Hindi) is an offline-first React Native (Expo) app for
the Indian market. Point it at a barcode and it looks the product up on
[Open Food Facts](https://world.openfoodfacts.org/) / Open Beauty Facts, then computes a
**health score personalised to your profile** — diet, goals, and conditions like diabetes,
hypertension, or PCOS — and explains the verdict in plain language.

No account. No tracking. All your data lives on your device.

---

## What it does

- **Barcode scan → instant verdict.** A grade (A–E) and a 0–100 Padho Score, personalised
  to your health profile when one is set up — with a "why this grade" breakdown.
- **Allergen & diet enforcement (v5).** Your declared allergies (gluten, dairy, nuts, soy,
  egg) and diet (veg / vegan / Jain / satvik / eggitarian) are checked against every
  ingredient list — conflicts surface as unmissable alert banners.
- **Sugar in teaspoons (v5).** 56g/100g means nothing; "14 teaspoons" lands. Per serving
  when the pack declares one.
- **Smarter added-sugar analysis (v5).** Intrinsic lactose/fructose (plain milk, dahi,
  100% juice) is no longer punished like added sugar — the engine reads the ingredient
  list to tell the difference.
- **Nutrition breakdown.** Per-100g values with bars against your personal daily limits.
- **Ingredient & additive analysis.** Flags 80+ FSSAI-notified additives (E/INS numbers) by
  concern level, with notes; a separate database for cosmetics.
- **"For You" insights.** Plain-language, rule-based bullets (no LLM, no hallucination)
  tailored to your goals and conditions.
- **Label OCR fallback.** Product not in the database? Snap the label — v5 extracts the
  **ingredients list** as well as the nutrition numbers (via the free
  [OCR.space](https://ocr.space/ocrapi) API), and lets you name unknown products so they're
  remembered properly.
- **~100-product Indian seed catalog (v5).** Big-brand biscuits, namkeen, noodles,
  chocolates, drinks, dairy, spreads and more ship in the bundle — so Compare, Healthier
  Swaps and search work offline from the first launch, and every scan you make grows the
  on-device catalog further.
- **Healthier swaps.** Every result shows better-scored alternatives from the same
  category, with a Swiggy Instamart hand-off to buy them.
- **Pantry & history.** Track what you keep at home and review past scans. Everything is
  stored locally.

## Architecture

- **Offline-first, no backend.** All user state (profile, history, pantry, favourites) is
  in device `AsyncStorage`. There is no login and nothing is synced to a server.
- **Three-tier product lookup** (`getProductByBarcode`), each tier optional/graceful:

  ```
  scan → curated catalog (Airtable)  →  Open Food Facts  →  OCR the label
         your D2C / new-edition SKUs     world+India+beauty   any product, editable
  ```

  The curated catalog is read-only and opt-in (see env below); with no token set the app
  is a plain OFF + OCR scanner. The analysis engine is identical regardless of source.
- **Self-healing intelligence** (`src/services/intelligence/`): a local-first resolution
  waterfall (barcode → brand+name+qty → same-product line → fuzzy) over a bundled seed
  catalog plus a learned cache. Any product resolved via Open Food Facts or OCR is written
  back, so the slow path never runs twice on a device, and queued to grow the shared
  catalog. It powers the **Compare** screen — ranks options for *your* profile, leading
  with the axis that matters (sugar for diabetes, sodium for hypertension…).
  See [docs/INTELLIGENCE.md](docs/INTELLIGENCE.md) and [USER_GUIDE.md](USER_GUIDE.md).
- **Scoring engine** (`src/services/ratingEngine.ts`): a transparent Nutri-Score base plus a
  personalised 0–100 score derived from `HealthConstraints` computed from the user profile.
- **OCR** (`src/services/ocrNutrition.ts`): image → text via OCR.space, then a regex parser.
  The recognition step is isolated so an on-device engine (e.g. Google ML Kit) can drop in
  later without touching the parser.

```
src/
  screens/      Home · Scan · Pantry · Profile · History · Result · IngredientsSnap · Settings · Onboarding
  services/     api · ratingEngine · ocrNutrition · additivesService · beautyService
                history · favorites · pantryService · userProfileService · flagDerivation
  types/        shared TypeScript types
  theme.ts      colours, typography, spacing
```

## Getting started

```bash
npm install
cp .env.example .env      # optional — only needed for label OCR
npm run android           # or: npm run ios / npm start
```

### Environment

All variables are **optional** — with none set, the app is a fully working OFF + OCR scanner.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_AIRTABLE_BASE_ID` | Curated catalog base (`appdFbiM5AogN1muz` = the "Padho Label" base). |
| `EXPO_PUBLIC_AIRTABLE_TOKEN` | **Read-only, base-scoped** Airtable PAT (`data.records:read`). Bundled into the client — never use a broad token. |
| `EXPO_PUBLIC_AIRTABLE_TABLE` | Catalog table name (default `Products`). |
| `EXPO_PUBLIC_OCRSPACE_API_KEY` | Free [OCR.space](https://ocr.space/ocrapi) key (25k req/month) for the label-scan fallback. Falls back to the rate-limited `helloworld` demo key if unset. |

## Scripts

- `npm start` — Expo dev server
- `npm run android` / `npm run ios`
- `npm test` — Jest unit tests (scoring, OCR parsing, additive detection, intelligence)
- `npm run build:catalog` — regenerate the bundled catalog from `scripts/sources/*.json`
- `npm run promote <file>` — fold an exported contribution queue into the catalog source
- `npm run android` build pipeline & Play Store submission: see [SETUP.md](SETUP.md)

## Quality

```bash
npx tsc --noEmit   # type-check (clean)
npm test           # 18 tests, all green
```

## Disclaimer

Padho Label is an informational tool, **not medical advice**. Always consult a qualified
professional for dietary decisions. Nutrition data is community-sourced from Open Food Facts
and may be incomplete or out of date.

*Contains information from [Open Food Facts](https://world.openfoodfacts.org/), made
available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).*
