// GameSource for a game in progress. One request at a time, a fixed pace, exponential backoff
// with jitter on failure, slower while the window is hidden (docs/PROBE_REPORT.md §4, §6.1).
//
// First load: the summary (teams, players) and every play, delivered as the current state only
// (no replay of what already happened). After that, each poll asks the core API for the game
// status (period, clock; ~250 B gzipped) and the play count (~200 B). When the count changes, only
// the tail is fetched, starting a few plays before the end so recent corrections come along.
// ESPN also inserts late plays mid-list and corrects old ones, so every few minutes the whole list
// is fetched again (~40 KB gzipped). Corrections update the state without replaying events.

import type { GameHandlers, GameSource, GameState, TimelineEntry, Unsubscribe } from '../../model/types.ts';
import type { CorePlay, CorePlayPage, GameFeed, Summary } from './feed-types.ts';
import { allPlays, competition, loadFeed, type FetchJson } from './fetch.ts';
import { buildTimeline, gameStatus, initialState } from './timeline.ts';
import { systemClock, type Clock } from '../replay/player.ts';

export type { FetchJson };

const TAIL_PAGE = 25;

export interface LiveOptions {
  clock?: Clock;
  /** Interval between polls, ms. ESPN's core API caches plays for 10 s. */
  waitMs?: number;
  /** Interval while the game has not started, ms. */
  pregameWaitMs?: number;
  /** How often the whole play list is fetched again, ms. */
  fullRefreshMs?: number;
  /** Plays before the end to fetch again with each tail, for recent corrections. */
  overlap?: number;
  /** Longest wait after repeated failures, ms. */
  maxBackoffMs?: number;
  /** Multiplier on the interval while the window is hidden. */
  backgroundFactor?: number;
  random?: () => number;
}

export interface LiveStatus {
  /** False after a failed request until the next success. */
  connected: boolean;
  failures: number;
  lastSuccessAt?: number;
  requests: number;
  /** Times ESPN changed a play we had already delivered. */
  corrections: number;
  /** Polling stopped because the game is over, postponed or cancelled. */
  stopped: boolean;
}

interface CoreStatus {
  clock: number;
  period: number;
  type: { name: string };
}

const DONE = new Set(['final', 'postponed', 'cancelled']);
const signature = (e: TimelineEntry) => JSON.stringify(e.events);
/** How far into the game a state is: later periods first, then less time on the clock. */
const moment = (s: GameState) => s.period * 10_000 - s.clock;

/** Replace the plays from `start` on with `window`, dropping any earlier copy of a play in it. */
export function mergeTail(old: readonly CorePlay[], window: readonly CorePlay[], start: number): CorePlay[] {
  const ids = new Set(window.map((p) => p.id));
  return [...old.slice(0, start).filter((p) => !ids.has(p.id)), ...window];
}

class LiveGame {
  status: LiveStatus = { connected: true, failures: 0, requests: 0, corrections: 0, stopped: false };
  background = false;
  private summary: Summary | null = null;
  private plays: CorePlay[] = [];
  private core: CoreStatus | null = null;
  private lastFull = 0;
  private timer: unknown = null;
  private cancelled = false;
  private delivered = new Map<string, string>();
  private lastState = '';
  private readonly id: string;
  private readonly handlers: GameHandlers;
  private readonly fetchJson: FetchJson;
  private readonly o: Required<LiveOptions>;

  constructor(id: string, handlers: GameHandlers, fetchJson: FetchJson, o: Required<LiveOptions>) {
    this.id = id;
    this.handlers = handlers;
    this.fetchJson = fetchJson;
    this.o = o;
  }

  start(): void { void this.tick(); }

  stop(): void {
    this.cancelled = true;
    if (this.timer !== null) this.o.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Poll now instead of at the next scheduled time: the window is back from hidden, where it
   *  waited `backgroundFactor` times longer. Nothing to do while a poll is already running (its own
   *  timer is not set yet) or after the game ended (none is set again). */
  pollNow(): void {
    if (this.timer === null || this.cancelled) return;
    this.o.clock.clearTimeout(this.timer);
    void this.tick();
  }

  private schedule(ms: number): void {
    if (this.cancelled) return;
    const wait = this.background ? ms * this.o.backgroundFactor : ms;
    this.timer = this.o.clock.setTimeout(() => void this.tick(), wait);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    let next: number;
    try {
      await this.refresh();
      if (this.cancelled) return;
      this.status = { ...this.status, connected: true, failures: 0, lastSuccessAt: this.o.clock.now() };
      const st = this.deliver();
      if (DONE.has(st.status)) { this.status = { ...this.status, stopped: true }; return; }
      next = st.status === 'scheduled' ? this.o.pregameWaitMs : this.o.waitMs;
    } catch (err) {
      if (this.cancelled) return;
      const failures = this.status.failures + 1;
      this.status = { ...this.status, connected: false, failures };
      this.handlers.onError?.(err);
      const base = Math.min(this.o.maxBackoffMs, this.o.waitMs * 2 ** failures);
      next = base * (0.75 + this.o.random() * 0.5);
    }
    this.schedule(next);
  }

  private get(url: string): Promise<unknown> {
    this.status = { ...this.status, requests: this.status.requests + 1 };
    return this.fetchJson(url);
  }

  private async refresh(): Promise<void> {
    if (!this.summary) {
      ({ summary: this.summary, plays: this.plays } = await loadFeed((u) => this.get(u), this.id));
      this.lastFull = this.o.clock.now();
      return;
    }
    this.core = (await this.get(`${competition(this.id)}/status`)) as CoreStatus;
    if (this.o.clock.now() - this.lastFull >= this.o.fullRefreshMs) {
      this.plays = await allPlays((u) => this.get(u), this.id);
      this.lastFull = this.o.clock.now();
      return;
    }
    // A page past the end has no items but still says how many plays there are.
    const { count } = (await this.get(`${competition(this.id)}/plays?limit=1&page=999999`)) as CorePlayPage;
    if (count === this.plays.length) return;
    const start = Math.max(0, Math.min(this.plays.length, count) - this.o.overlap);
    const window: CorePlay[] = [];
    for (let page = Math.floor(start / TAIL_PAGE) + 1; page <= Math.ceil(count / TAIL_PAGE); page++) {
      const res = (await this.get(`${competition(this.id)}/plays?limit=${TAIL_PAGE}&page=${page}`)) as CorePlayPage;
      window.push(...res.items);
    }
    this.plays = mergeTail(this.plays, window.slice(start - Math.floor(start / TAIL_PAGE) * TAIL_PAGE), start);
  }

  /** Hand new entries to the handlers. Returns the current state. */
  private deliver(): GameState {
    const feed: GameFeed = { summary: this.summary!, plays: this.plays };
    const timeline = buildTimeline(feed);
    const last = timeline.at(-1);
    const current = this.withStatus(last?.state ?? initialState(feed));

    if (this.lastState === '') {
      // First load: show where the game is now; do not replay what already happened.
      for (const e of timeline) this.delivered.set(e.id, signature(e));
      this.emitState(current, last);
      return current;
    }

    let revised = false;
    const fresh: TimelineEntry[] = [];
    const present = new Set<string>();
    // A new play from earlier in the game than the latest one we delivered was inserted late: a
    // correction, because playing its events now (a basket from minutes ago) would show it at the
    // wrong moment. A play at the same game clock is news: ESPN often publishes a free throw after
    // the substitutions at the same stoppage, yet lists it before them (docs/PROBE_REPORT.md §9.3).
    let latest = -Infinity;
    for (const e of timeline) if (this.delivered.has(e.id)) latest = Math.max(latest, moment(e.state));
    for (const e of timeline) {
      present.add(e.id);
      const seen = this.delivered.get(e.id);
      if (seen === undefined && moment(e.state) >= latest) fresh.push(e);
      else if (seen !== signature(e)) revised = true;
      this.delivered.set(e.id, signature(e));
    }
    for (const k of [...this.delivered.keys()]) {
      if (present.has(k)) continue;
      this.delivered.delete(k);
      revised = true;
    }
    if (revised) this.status = { ...this.status, corrections: this.status.corrections + 1 };

    for (const e of fresh) {
      for (const ev of e.events) this.handlers.onEvent(ev, e);
      this.emitState(e === last ? current : e.state, e);
    }
    // Corrections, the clock running, status changes: state only.
    if (fresh.length === 0) this.emitState(current, last);
    return current;
  }

  /** The status endpoint is fresher than the last play for status, period and clock. */
  private withStatus(state: GameState): GameState {
    if (!this.core || this.core.period < state.period) return state;
    return { ...state, status: gameStatus(this.core.type.name), period: this.core.period, clock: this.core.clock };
  }

  private emitState(state: GameState, entry: TimelineEntry | undefined): void {
    const s = JSON.stringify(state);
    if (s === this.lastState) return;
    this.lastState = s;
    this.handlers.onState(state, entry ?? { t: 0, id: '', events: [], state });
  }
}

export class EspnLiveSource implements GameSource {
  private readonly games = new Map<string, LiveGame>();
  private readonly fetchJson: FetchJson;
  private readonly opts: Required<LiveOptions>;

  constructor(fetchJson: FetchJson, opts: LiveOptions = {}) {
    this.fetchJson = fetchJson;
    this.opts = {
      clock: opts.clock ?? systemClock,
      waitMs: opts.waitMs ?? 10_000,
      pregameWaitMs: opts.pregameWaitMs ?? 60_000,
      fullRefreshMs: opts.fullRefreshMs ?? 120_000,
      overlap: opts.overlap ?? 10,
      maxBackoffMs: opts.maxBackoffMs ?? 300_000,
      backgroundFactor: opts.backgroundFactor ?? 3,
      random: opts.random ?? Math.random,
    };
  }

  status(gameId: string): LiveStatus | undefined {
    return this.games.get(gameId)?.status;
  }

  /** Poll less often while the window is hidden. */
  setBackground(background: boolean): void {
    for (const g of this.games.values()) {
      // Back in view: the score now, not after what is left of a background wait.
      if (g.background && !background) g.pollNow();
      g.background = background;
    }
  }

  subscribe(gameId: string, handlers: GameHandlers): Unsubscribe {
    this.games.get(gameId)?.stop();
    const game = new LiveGame(gameId, handlers, this.fetchJson, this.opts);
    this.games.set(gameId, game);
    game.start();
    return () => {
      game.stop();
      if (this.games.get(gameId) === game) this.games.delete(gameId);
    };
  }
}
