// The M0 acceptance check: does the play-by-play rebuild the official score?
// Compares the plays' running score with the summary header's final and per-period lines.

/** Returns { ok, lines: string[] } for one ESPN summary. */
export function checkScore(j) {
  const plays = j.plays ?? [];
  const comps = j.header.competitions[0].competitors;
  const byHA = Object.fromEntries(comps.map((c) => [c.homeAway, c]));
  const lines = [];
  let ok = true;
  const last = plays.at(-1);
  const official = { away: Number(byHA.away.score), home: Number(byHA.home.score) };
  const finalOk = last?.awayScore === official.away && last?.homeScore === official.home;
  ok &&= finalOk;
  lines.push(`final official=${official.away}-${official.home} last play=${last?.awayScore}-${last?.homeScore} ${finalOk ? 'OK' : 'MISMATCH'}`);

  // Per period: score at the last play of each period, differenced.
  const atEnd = {};
  for (const p of plays) atEnd[p.period.number] = { away: p.awayScore, home: p.homeScore };
  const periods = Object.keys(atEnd).map(Number).sort((a, b) => a - b);
  for (const side of ['away', 'home']) {
    const official = (byHA[side].linescores ?? []).map((l) => Number(l.displayValue ?? l.value));
    let prev = 0;
    const mine = periods.map((q) => { const d = atEnd[q][side] - prev; prev = atEnd[q][side]; return d; });
    const same = official.join() === mine.join();
    ok &&= same;
    lines.push(`${side} ${byHA[side].team.abbreviation} official=${official.join(',')} from plays=${mine.join(',')} ${same ? 'OK' : 'MISMATCH'}`);
  }

  const sum = { away: 0, home: 0 };
  for (const p of plays) if (p.scoringPlay) sum[p.team?.id === byHA.home.team.id ? 'home' : 'away'] += p.scoreValue ?? 0;
  const sumOk = sum.away === official.away && sum.home === official.home;
  ok &&= sumOk;
  lines.push(`sum of scoreValue=${sum.away}-${sum.home} ${sumOk ? 'OK' : 'MISMATCH'}`);
  return { ok, lines, periods: periods.length };
}
