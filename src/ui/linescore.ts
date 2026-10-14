// The line score window, under the main window while the stats are open: points per period. It draws
// what the main window sends (src/ui/main.ts sendStats) and leaves with the stats window.
//
// Under `npm run dev` in a browser: ?game=<id>&fixture shows a recorded game's final line score.

import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/barlow-condensed/latin-600';
import type { GameState } from '../model/types.ts';
import type { GameFeed } from '../data/espn/feed-types.ts';
import { buildTimeline } from '../data/espn/timeline.ts';
import { langOf, STRINGS } from '../i18n/index.ts';
import { lineScoreView } from './views.ts';
import { closeOnRequest } from './side-window.ts';

type Line = Pick<GameState, 'teams' | 'periodScores' | 'score' | 'period' | 'status'> & { favourites: readonly string[]; lang: string };

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const show = (l: Line) => { app.innerHTML = lineScoreView(l, STRINGS[langOf(l.lang)], l.favourites); };

void closeOnRequest(app);
if ('__TAURI_INTERNALS__' in window) {
  const { listen, emitTo } = await import('@tauri-apps/api/event');
  await listen<Line>('linescore-state', (e) => show(e.payload));
  await emitTo('main', 'linescore-ready');
} else if (import.meta.env.DEV && params.has('fixture') && params.get('game')) {
  const feed = await (await fetch(`/fixtures/nba/game-${params.get('game')}.json`)).json() as GameFeed;
  const last = buildTimeline(feed).at(-1)!.state;
  show({ ...last, favourites: [], lang: params.get('lang') ?? navigator.language });
}
