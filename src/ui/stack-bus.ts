// How the main window and the cards' own window (src/ui/stack.ts, src/ui/stack-window.ts) talk: Tauri
// events between the two windows; under `npm run dev` in a browser, where the cards' window is an iframe
// over the page (src/ui/main.ts &stackroom), a BroadcastChannel between the two pages.

import type { GameCard } from '../model/types.ts';

export type Side = 'main' | 'stack';

/** What the main window tells the cards' window. */
export interface Show {
  /** Today's games, the game on screen, the favourites: the cards' window works out the cards behind. */
  today: GameCard[];
  currentId?: string;
  favourites: readonly string[];
  lang: string;
  /** The main window's height, and how many cards there is room for above it. */
  cardH: number;
  shown: number;
}
export interface Messages {
  /** main → stack: bring the cards up. */
  'stack-show': Show;
  /** main → stack: ESPN's newer list, for the cards' strips. */
  'stack-refresh': { today: GameCard[] };
  /** main → stack, in a browser only: where the pointer is on the page (the cards' window watches it). */
  'stack-cursor': { x: number; y: number };
  /** main → stack: down at once (a panel, a size, the stats, a drag). */
  'stack-close': null;
  /** stack → main: the cards are up, or down again. */
  'stack-state': { up: boolean };
  /** stack → main: a card drawn out is coming down over the main window. */
  'stack-landing': null;
  /** stack → main: a card drawn out to the front, now in front of the main window. */
  'stack-picked': { card: GameCard };
  /** stack → main, in a browser only: let the pointer through the iframe, or not. */
  'stack-through': boolean;
}

export interface Bus {
  send<K extends keyof Messages>(to: Side, type: K, payload: Messages[K]): void;
  on<K extends keyof Messages>(type: K, handler: (payload: Messages[K]) => void): void;
}

const shell = '__TAURI_INTERNALS__' in window;

export async function bus(self: Side): Promise<Bus> {
  if (shell) {
    const { emitTo } = await import('@tauri-apps/api/event');
    // Only what is sent to this window (a plain listen() hears what is sent to either).
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const me = getCurrentWebviewWindow();
    return {
      send: (to, type, payload) => void emitTo(to, type, payload),
      on: (type, handler) => void me.listen(type, (e) => handler(e.payload as never)),
    };
  }
  const channel = new BroadcastChannel('courtsmall-stack');
  const handlers = new Map<string, (p: never) => void>();
  channel.onmessage = (e: MessageEvent<{ to: Side; type: string; payload: unknown }>) => {
    if (e.data.to === self) handlers.get(e.data.type)?.(e.data.payload as never);
  };
  return {
    send: (to, type, payload) => channel.postMessage({ to, type, payload }),
    on: (type, handler) => void handlers.set(type, handler as (p: never) => void),
  };
}
