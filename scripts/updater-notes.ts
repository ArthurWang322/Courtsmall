// Puts the changelog (src/changelog.ts) in a release's latest.json as its notes, as JSON: the app reads it
// when it finds the update (src/ui/update.ts parseNotes) and its update screen says what changed. The
// release workflow runs this once both builds have written latest.json (.github/workflows/release.yml).
// The updater checks the signature of what it downloads, not latest.json, so changing the notes is safe.
//
// Usage: node scripts/updater-notes.ts latest.json

import { readFileSync, writeFileSync } from 'node:fs';
import { CHANGELOG } from '../src/changelog.ts';

const path = process.argv[2];
if (!path) throw new Error('usage: node scripts/updater-notes.ts latest.json');
const latest = JSON.parse(readFileSync(path, 'utf8')) as { version: string; notes?: string };
if (!CHANGELOG.some((r) => r.version === latest.version)) throw new Error(`src/changelog.ts has no entry for ${latest.version}`);
latest.notes = JSON.stringify(CHANGELOG);
writeFileSync(path, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`notes: ${CHANGELOG.length} releases, newest ${CHANGELOG[0]!.version}`);
