// A poll's plays show one after another, so the play lines roll instead of jumping two at a time.

import { describe, expect, it } from 'vitest';
import { Pacer } from '../src/ui/pacer.ts';
import { FakeClock } from './fake-clock.ts';

describe('Pacer', () => {
  it('shows the first at once and the rest one step apart, in order', () => {
    const clock = new FakeClock(), shown: string[] = [];
    const p = new Pacer<string>((s) => { shown.push(s); }, 1200, 3, clock);
    p.push('miss'); p.push('rebound'); p.push('putback');
    expect(shown).toEqual(['miss']);
    clock.advance(1200);
    expect(shown).toEqual(['miss', 'rebound']);
    clock.advance(1200);
    expect(shown).toEqual(['miss', 'rebound', 'putback']);
  });

  // After the window was hidden a poll may bring many plays; showing them all would lag the game.
  it('keeps only the latest few of a backlog', () => {
    const clock = new FakeClock(), shown: number[] = [];
    const p = new Pacer<number>((s) => { shown.push(s); }, 1000, 3, clock);
    p.push(1);
    for (let i = 2; i <= 9; i++) p.push(i);
    clock.advance(10_000);
    expect(shown).toEqual([1, 7, 8, 9]);
  });

  it('shows a state at once when nothing is queued, and drops the queue for a new game', () => {
    const clock = new FakeClock(), shown: number[] = [];
    const p = new Pacer<number>((s) => { shown.push(s); }, 1000, 3, clock);
    p.push(1); clock.advance(5000); p.push(2);
    expect(shown).toEqual([1, 2]);
    p.push(3); p.clear(); clock.advance(5000);
    expect(shown).toEqual([1, 2]);
  });

  // A shot holds the next play back for its whole animation, so the text never runs ahead of the court.
  it('waits as long as showing an item asks before the next', () => {
    const clock = new FakeClock(), shown: string[] = [];
    const p = new Pacer<string>((s) => { shown.push(s); return s === 'shot' ? 2500 : undefined; }, 1000, 3, clock);
    p.push('shot'); p.push('rebound');
    clock.advance(1000);
    expect(shown).toEqual(['shot']);
    clock.advance(1500);
    expect(shown).toEqual(['shot', 'rebound']);
  });
});

