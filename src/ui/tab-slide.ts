// Switching tabs (the sides in the players window, the conferences in the standings): the underline
// glides from the tab left to the one picked, and what is under the tabs slides in from that side
// (app.css .tab-moved, .tab-in-left, .tab-in-right). Only on a click: the redraws in between (a new
// play, the standings arriving) draw the tabs in place without moving.

/** Where a tab's underline sits, along the row. */
export interface TabBox { left: number; width: number }

/**
 * The underline's move and the content's side, from the tab left to the one picked: `dx` and `scale`
 * put the new underline where the old one was (app.css animates them back to nothing); the content
 * comes in from the right when the new tab is to the right of the old one. Nothing when it is the same tab.
 */
export function tabMove(from: TabBox, to: TabBox): { dx: number; scale: number; from: 'left' | 'right' } | undefined {
  if (from.left === to.left || to.width <= 0) return undefined;
  return { dx: from.left - to.left, scale: from.width / to.width, from: to.left > from.left ? 'right' : 'left' };
}

/** The underline's box inside a tab: inset 6px each side (app.css .side.on::after). */
const UNDERLINE_INSET = 6;
const boxOf = (el: Element): TabBox => {
  const r = el.getBoundingClientRect();
  return { left: r.left + UNDERLINE_INSET, width: r.width - 2 * UNDERLINE_INSET };
};

/**
 * Redraws `root` with `redraw`, then moves from the tab that was on to the one on now; `content`
 * picks what slides in under the tabs.
 */
export function switchTab(root: HTMLElement, redraw: () => void, content: string): void {
  const before = root.querySelector('.side.on');
  const from = before ? boxOf(before) : undefined;
  redraw();
  const after = root.querySelector<HTMLElement>('.side.on');
  if (!from || !after) return;
  const move = tabMove(from, boxOf(after));
  if (!move) return;
  after.style.setProperty('--tab-dx', `${move.dx}px`);
  after.style.setProperty('--tab-scale', `${move.scale}`);
  after.classList.add('tab-moved');
  for (const el of root.querySelectorAll(content)) el.classList.add(`tab-in-${move.from}`);
}
