// A game switched to from the card stack comes in line by line: each line rises a little into place,
// out of a blur, one after another from the top (app.css `.reveal`). Its window is drawn again with
// every play while they do; each line's animation is resumed where it was (`--reveal-age`), as the
// view coming back from a panel is (src/ui/main.ts `.entering`).

/** Between one line starting and the next, and how long each line takes, ms (app.css `.reveal`). */
export const REVEAL_STAGGER_MS = 40;
export const REVEAL_MS = 450;

/** How long `lines` lines take to come in, the last one included, ms. */
export const revealSpan = (lines: number): number => (lines ? (lines - 1) * REVEAL_STAGGER_MS + REVEAL_MS : 0);

/**
 * Marks `lines` to come in, `age` ms after they started: the nth line (each one element, or several
 * side by side) starts n steps after the first. Whether they are still coming in.
 */
export function reveal(root: HTMLElement, lines: readonly (readonly HTMLElement[])[], age: number): boolean {
  if (age >= revealSpan(lines.length)) return false;
  root.style.setProperty('--reveal-age', `${-age}ms`);
  lines.forEach((line, i) => { for (const el of line) { el.classList.add('reveal'); el.style.setProperty('--i', String(i)); } });
  return true;
}
