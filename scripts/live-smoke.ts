// Runs the live source against ESPN for a few minutes and prints what it delivers.
// Usage: node scripts/live-smoke.ts <eventId> [minutes]
import { EspnLiveSource } from '../src/data/espn/live-source.ts';

const [id, minutes = '3'] = process.argv.slice(2);
if (!id) throw new Error('usage: node scripts/live-smoke.ts <eventId> [minutes]');
let bytes = 0;
const source = new EspnLiveSource(async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'small-nba-smoke/0.1 (open-source, personal non-commercial use)' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  bytes += text.length;
  return JSON.parse(text);
});
const hhmm = () => new Date().toISOString().slice(11, 19);
source.subscribe(id, {
  onEvent: (e) => console.log(`${hhmm()} event ${e.type} ${e.type === 'basket' ? `${e.basket.side} +${e.basket.points} ${e.basket.player?.short ?? '?'} -> ${e.score.away}-${e.score.home}` : ''}`),
  onState: (s) => console.log(`${hhmm()} state ${s.status} P${s.period} ${Math.floor(s.clock / 60)}:${String(Math.floor(s.clock % 60)).padStart(2, '0')} ${s.teams.away.abbr} ${s.score.away}-${s.score.home} ${s.teams.home.abbr} poss=${s.possession ?? '-'} run=${s.run ? `${s.run.side} ${s.run.points}` : '-'}`),
  onError: (e) => console.log(`${hhmm()} error ${String(e)}`),
});
setTimeout(() => {
  const st = source.status(id)!;
  console.log(`requests=${st.requests} corrections=${st.corrections} connected=${st.connected} decoded bytes=${bytes}`);
  process.exit(0);
}, Number(minutes) * 60_000);
