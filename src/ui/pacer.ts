// Shows a burst of states one at a time. A poll brings several plays at once (a miss, the rebound,
// the putback), and drawing only the last made the play lines jump two plays at a time; so states
// queue and show one after another, the first at once. Showing one says how long until the next
// (a shot: its whole animation, so the text and the court stay together); otherwise `stepMs`. A
// backlog keeps only the latest few, so the screen never falls behind the game. The clock is
// injectable (tests/fake-clock.ts).

import { systemClock, type Clock } from '../data/replay/player.ts';

export class Pacer<T> {
  private queue: T[] = [];
  private timer: unknown = null;
  private readonly show: (item: T) => number | void;
  private readonly stepMs: number;
  private readonly keep: number;
  private readonly clock: Clock;

  constructor(show: (item: T) => number | void, stepMs: number, keep: number, clock: Clock = systemClock) {
    this.show = show;
    this.stepMs = stepMs;
    this.keep = keep;
    this.clock = clock;
  }

  push(item: T): void {
    this.queue.push(item);
    if (this.queue.length > this.keep) this.queue.splice(0, this.queue.length - this.keep);
    if (this.timer === null) this.next();
  }

  /** Drop what is queued (a new game). */
  clear(): void {
    this.queue = [];
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private next(): void {
    const item = this.queue.shift();
    if (item === undefined) { this.timer = null; return; }
    const wait = this.show(item);
    this.timer = this.clock.setTimeout(() => this.next(), typeof wait === 'number' ? wait : this.stepMs);
  }
}
