// When each timeline entry should play during a replay. Default is compact.

import type { TimelineEntry } from '../../model/types.ts';

export type PaceMode =
  /** The game's own timestamps. */
  | { kind: 'real' }
  /** Real timestamps, with dead time capped. Play-to-play rhythm stays close to live. */
  | { kind: 'compact' }
  /** Every entry the same number of seconds apart. */
  | { kind: 'fixed'; seconds: number }
  /** Only baskets, period ends and the game end; everything between is skipped. */
  | { kind: 'results'; seconds?: number };

export const DEFAULT_PACE: PaceMode = { kind: 'compact' };

/** Caps for compact mode, seconds. Measured on the 14 fixtures (docs/PROBE_REPORT.md §9):
 *  8 s median and 31 s p90 between plays in a period, 132 s between quarters, 869 s at halftime;
 *  16% of plays share their second with the one before (substitutions, free throws). */
export const COMPACT_CAPS = { withinPeriod: 12, betweenPeriods: 10, floor: 0.5 } as const;

export interface Slot {
  /** Index into the timeline. */
  index: number;
  /** Milliseconds from the start of the replay. */
  at: number;
}

const RESULT = new Set(['basket', 'periodEnd', 'gameEnd']);

export function schedule(entries: readonly TimelineEntry[], mode: PaceMode): Slot[] {
  if (entries.length === 0) return [];
  const first = entries[0]!;

  if (mode.kind === 'real') return entries.map((e, index) => ({ index, at: Math.max(0, e.t - first.t) }));

  if (mode.kind === 'fixed') {
    const step = Math.max(0, mode.seconds) * 1000;
    return entries.map((_, index) => ({ index, at: index * step }));
  }

  if (mode.kind === 'results') {
    const step = (mode.seconds ?? 3) * 1000;
    const picked = entries
      .map((e, index) => ({ e, index }))
      .filter(({ e }) => e.events.some((ev) => RESULT.has(ev.type)));
    return picked.map(({ index }, i) => ({ index, at: i * step }));
  }

  // compact. ESPN's wallclock sometimes steps backwards; such a gap counts as the floor.
  const out: Slot[] = [{ index: 0, at: 0 }];
  let at = 0;
  for (let i = 1; i < entries.length; i++) {
    const a = entries[i - 1]!, b = entries[i]!;
    const gap = Math.max(0, (b.t - a.t) / 1000);
    const cap = a.state.period !== b.state.period || a.state.status === 'break' ? COMPACT_CAPS.betweenPeriods : COMPACT_CAPS.withinPeriod;
    at += Math.max(COMPACT_CAPS.floor, Math.min(gap, cap)) * 1000;
    out.push({ index: i, at });
  }
  return out;
}

/** Total length of a replay in milliseconds. */
export const duration = (slots: readonly Slot[]) => slots.at(-1)?.at ?? 0;
