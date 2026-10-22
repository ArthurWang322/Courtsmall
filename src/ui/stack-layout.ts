// Where the cards behind the main window go (src/ui/stack.ts). The numbers are the prototype the
// maintainer approved (2026-10-22): each card behind shows a strip above the one in front of it, a
// little smaller and dimmer, like a stack of files seen from the front.

/** How much higher each card behind sits than the one in front, px. */
export const STEP = 13;
/** How far a card behind rises under the pointer, px. */
export const LIFT = 30;
/** How much smaller, and dimmer, each card behind is than the one in front. */
export const SCALE = 0.014;
export const DIM = 0.05;
/** A card under the pointer is lit this bright, however far back it is, so its strip can be read. */
export const LIT = 1.12;
/** The cards come up one after another, the nearest first, this far apart, each taking FAN_MS, ms
 *  (slower than the prototype's 28 and 520: the maintainer wanted them smoother, 2026-10-22). */
export const STAGGER_MS = 36;
export const FAN_MS = 650;
/** How long the pointer may be off the stack before it goes back down, ms. */
export const CLOSE_AFTER_MS = 300;
/** A card drawn out: up and out of the stack, then down in front, ms. */
export const RISE_MS = 380;
export const LAND_MS = 520;
/** The strip along the main window's top edge that brings the stack up, px. */
export const EDGE_H = 16;
/** How far above the front card's top a card drawn out clears it, px. */
export const PICK_CLEAR = 12;

/** A card's place at `depth` (0: the front card, the main window), `lifted` under the pointer. */
export function cardPlace(depth: number, lifted = false): { y: number; scale: number; brightness: number } {
  return { y: 0 - depth * STEP - (lifted ? LIFT : 0), scale: 1 - depth * SCALE, brightness: lifted ? LIT : 1 - depth * DIM };
}

/**
 * How much the window grows upward to show `cards` cards behind a `cardH` high main window, and how
 * many it shows: room for the stack and a card lifted, or for a card drawn out clear of the front one,
 * whichever is more; no more than there is above the window (`roomAbove`), the cards beyond it left out.
 */
export function stackRoom(cards: number, cardH: number, roomAbove: number): { room: number; shown: number } {
  const need = Math.max(cards * STEP + LIFT, cardH + PICK_CLEAR);
  const room = Math.min(need, Math.max(0, roomAbove));
  return { room, shown: Math.min(cards, Math.max(0, Math.floor((room - LIFT) / STEP))) };
}

/** Where a card drawn out from `depth` rises to: its bottom clear of the front card's top, never lower than it was. */
export function pickRise(depth: number, cardH: number): number {
  return Math.min(-(cardH + PICK_CLEAR), cardPlace(depth).y);
}
