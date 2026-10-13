// GameSource for finished games: load the summary and plays once, then replay them.
// How the feed is loaded is injected (fixture file in tests, polite fetcher in the app).

import type { GameHandlers, GameSource, Unsubscribe } from '../../model/types.ts';
import type { GameFeed } from '../espn/feed-types.ts';
import { buildTimeline } from '../espn/timeline.ts';
import { ReplayPlayer, type ReplayOptions } from './player.ts';

export type FeedLoader = (gameId: string) => Promise<GameFeed>;

export class EspnReplaySource implements GameSource {
  private readonly players = new Map<string, ReplayPlayer>();
  private readonly load: FeedLoader;
  private readonly opts: ReplayOptions;

  constructor(load: FeedLoader, opts: ReplayOptions = {}) {
    this.load = load;
    this.opts = opts;
  }

  /** The player for a subscribed game, for pause / seek / pace controls. */
  player(gameId: string): ReplayPlayer | undefined {
    return this.players.get(gameId);
  }

  subscribe(gameId: string, handlers: GameHandlers): Unsubscribe {
    let cancelled = false;
    const offs: Unsubscribe[] = [];
    this.load(gameId)
      .then((feed) => {
        if (cancelled) return;
        const player = new ReplayPlayer(buildTimeline(feed), this.opts);
        this.players.set(gameId, player);
        offs.push(player.onEntry((entry, info) => {
          // A snap is a jump: the state is enough, replaying its events would mislead.
          if (!info.snap) for (const ev of entry.events) handlers.onEvent(ev, entry);
          handlers.onState(entry.state, entry);
        }));
        player.play();
      })
      .catch((err: unknown) => handlers.onError?.(err));
    return () => {
      cancelled = true;
      for (const off of offs) off();
      this.players.get(gameId)?.pause();
      this.players.delete(gameId);
    };
  }
}
