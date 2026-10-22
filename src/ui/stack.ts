// The card stack, the main window's side: today's other games as cards behind it, brought up from the
// strip along its top edge. The cards are drawn in their own window (src/ui/stack-window.ts), always
// there above and over this one: this window never changes size for them. Here: the strip and its
// hint, today's games, and the game drawn out; the cards' window watches the pointer itself.

import type { GameCard } from '../model/types.ts';
import { backCards } from './day-order.ts';
import { bus as makeBus } from './stack-bus.ts';
import { overlayRoom, stackRoom } from './stack-layout.ts';

/** What the stack asks of the main window. */
export interface StackHost {
  /** Today's games, asked of ESPN once each time the stack comes up; rejects when that fails. */
  today(): Promise<GameCard[]>;
  /** The last list of today's games there was (perhaps old), if any. */
  lastToday(): GameCard[] | undefined;
  currentId(): string | undefined;
  favourites(): readonly string[];
  lang(): string;
  /** Whether the stack may come up now: switched on, no panel open. */
  allowed(): boolean;
  /** How much of the screen there is above the window, and how high the window is, px. */
  roomAbove(): Promise<number>;
  cardHeight(): number;
  /** A card drawn out to the front (src/ui/main.ts). */
  picked(card: GameCard): void;
}

export interface Stack {
  /** Down at once: before the window changes size, or a panel opens. */
  closeNow(): void;
}

export function createStack(host: StackHost): Stack {
  const root = document.documentElement;
  const app = document.getElementById('app')!;
  const bus = makeBus('main');
  // The strip along the window's top edge: over #app.
  const edge = document.createElement('div');
  edge.className = 'edge';
  document.body.append(edge);

  let asking = false;
  async function bringUp(): Promise<void> {
    if (asking || !host.allowed()) return;
    asking = true;
    try {
      const fresh = host.today().catch(() => undefined);
      const list = host.lastToday() ?? (await fresh);
      if (!list) return;
      const count = backCards(list, host.currentId(), host.favourites()).length;
      edge.classList.toggle('none', !count);
      if (!count) return;
      const cardH = host.cardHeight();
      // As many as fit in the cards' window, and on the screen above this one.
      const { shown } = stackRoom(count, cardH, Math.min(overlayRoom(cardH), await host.roomAbove()));
      if (!shown) return;
      const b = await bus;
      const id = host.currentId();
      b.send('stack', 'stack-show', { today: list, ...(id ? { currentId: id } : {}), favourites: host.favourites(), lang: host.lang(), cardH, shown });
      // ESPN's newer list, when it comes: the cards' strips as they now stand.
      void fresh.then((newer) => { if (newer) b.send('stack', 'stack-refresh', { today: newer }); });
    } finally { asking = false; }
  }

  // Under `npm run dev` in a browser, where the pointer is, for the cards' window to watch (in the
  // app it asks the system).
  if (!('__TAURI_INTERNALS__' in window)) document.addEventListener('pointermove', (e) => void bus.then((b) => b.send('stack', 'stack-cursor', { x: e.clientX, y: e.clientY })));
  edge.addEventListener('pointerenter', () => void bringUp());

  // The hint along the top edge only when there is something behind (as far as the last list knows).
  app.addEventListener('pointerenter', () => {
    const list = host.lastToday();
    edge.classList.toggle('none', !host.allowed() || (!!list && !backCards(list, host.currentId(), host.favourites()).length));
  });
  void bus.then((b) => {
    b.on('stack-state', ({ up }) => root.classList.toggle('stack-up', up));
    b.on('stack-picked', ({ card }) => host.picked(card));
  });

  return { closeNow: () => void bus.then((b) => b.send('stack', 'stack-close', null)) };
}
