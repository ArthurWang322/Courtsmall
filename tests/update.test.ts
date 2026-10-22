// The update screen at start (the maintainer, 2026-10-22): with a newer version out, the app says what
// changed since the version in hand, from the notes the release carries (scripts/updater-notes.ts).

import { describe, expect, it } from 'vitest';
import { newerReleases, parseNotes } from '../src/ui/update.ts';
import type { Release } from '../src/changelog.ts';

const release = (version: string): Release => ({ version, date: '2026-10-22', title: { 'zh-TW': `標題 ${version}`, en: `Title ${version}` }, items: { 'zh-TW': ['一'], en: ['one'] } });

describe('update notes', () => {
  // Someone who skipped a version sees what it brought too, newest first.
  it('lists every version newer than the one in hand, newest first', () => {
    const notes = [release('0.5.1'), release('0.5.0'), release('0.4.3'), release('0.4.10')];
    expect(newerReleases(notes, '0.4.3').map((r) => r.version)).toEqual(['0.5.1', '0.5.0', '0.4.10']);
    expect(newerReleases(notes, '0.5.1')).toEqual([]);
  });

  // Versions compare as numbers, not text: 0.4.10 is newer than 0.4.9.
  it('compares versions part by part as numbers', () => {
    expect(newerReleases([release('0.4.10')], '0.4.9').map((r) => r.version)).toEqual(['0.4.10']);
    expect(newerReleases([release('1.0.0')], '0.12.0').map((r) => r.version)).toEqual(['1.0.0']);
  });

  // Notes from a release made before they carried the changelog are text, or nothing: no list then,
  // rather than a broken screen.
  it('reads the notes a release carries, and nothing from notes that are not a changelog', () => {
    expect(parseNotes(JSON.stringify([release('0.5.1')]))).toEqual([release('0.5.1')]);
    expect(parseNotes('Windows: download the -setup.exe and run it.')).toEqual([]);
    expect(parseNotes(undefined)).toEqual([]);
    expect(parseNotes(JSON.stringify([{ version: '0.5.1' }]))).toEqual([]);
  });
});
