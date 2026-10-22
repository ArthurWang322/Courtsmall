// A day's games in the order the app shows them: the games list (src/ui/views.ts gamesView) and the
// card stack behind the main window (src/ui/stack.ts) both use it, so the two never disagree.

import type { GameCard } from '../model/types.ts';

const ORDER: Partial<Record<GameCard['status'], number>> = { live: 0, break: 0, delayed: 0, scheduled: 1, final: 2 };

/** On, then to come, then finished; within each, the favourites' games first, then by tip-off. */
export function dayOrder(games: readonly GameCard[], favs: readonly string[]): GameCard[] {
  // Not views.ts favIn: views.ts imports this module.
  const isFav = (g: GameCard) => (favs.includes(g.teams.away.id) || favs.includes(g.teams.home.id) ? 0 : 1);
  return [...games].sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || isFav(a) - isFav(b) || a.start - b.start);
}

/** The cards behind the main window: the day in order, less the game on screen. A game on screen
 *  that is not one of the day's (another day's, or none) leaves all of the day behind it. */
export function backCards(today: readonly GameCard[], currentId: string | undefined, favs: readonly string[]): GameCard[] {
  return dayOrder(today, favs).filter((g) => g.id !== currentId);
}
