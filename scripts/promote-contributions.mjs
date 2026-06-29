#!/usr/bin/env node
/**
 * promote-contributions.mjs
 *
 * Folds a device's exported contribution queue (products it discovered via Open
 * Food Facts / OCR) into the shared catalog source so everyone gets them on the
 * next build. This is the self-healing catalog's "share back" step.
 *
 *   1. In the app, export the contribution queue to a JSON file.
 *   2. node scripts/promote-contributions.mjs path/to/contributions.json
 *   3. npm run build:catalog   (regenerates seed.ts)
 *   4. commit scripts/sources/contributed.json + src/services/intelligence/seed.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRIBUTED = join(__dirname, 'sources', 'contributed.json');

const dedupeKey = (row) =>
    `${row.barcode || ''}|${(row.brand || '').toLowerCase().trim()}|${(row.name || '').toLowerCase().trim()}`;

const main = async () => {
    const input = process.argv[2];
    if (!input) {
        console.error('Usage: node scripts/promote-contributions.mjs <exported-contributions.json>');
        process.exit(1);
    }

    let incoming;
    try {
        incoming = JSON.parse(await readFile(input, 'utf8'));
    } catch (e) {
        console.error(`Could not read ${input}: ${e.message}`);
        process.exit(1);
    }
    if (!Array.isArray(incoming)) {
        console.error('Expected the export to be a JSON array of products.');
        process.exit(1);
    }

    let existing = [];
    try {
        existing = JSON.parse(await readFile(CONTRIBUTED, 'utf8'));
    } catch {
        existing = []; // first run — file will be created
    }

    const byKey = new Map(existing.map(r => [dedupeKey(r), r]));
    let added = 0;
    for (const row of incoming) {
        if (!row || !row.name || !row.nutrition) continue;
        const k = dedupeKey(row);
        if (!byKey.has(k)) { byKey.set(k, row); added++; }
    }

    const merged = [...byKey.values()];
    await writeFile(CONTRIBUTED, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    console.log(`✓ ${added} new product(s) merged into ${CONTRIBUTED} (${merged.length} total).`);
    console.log('  Next: npm run build:catalog');
};

main().catch(e => { console.error(e); process.exit(1); });
