// The parts of ESPN's responses the adapter reads. Field names are from real responses
// (docs/PROBE_REPORT.md §2, §4.1, §6); everything else ESPN sends is ignored.

export interface Ref {
  $ref: string;
}

/** One play from the core API: `sports.core.api.espn.com/.../competitions/{id}/plays`. */
export interface CorePlay {
  id: string;
  sequenceNumber: string;
  type: { id: string; text: string };
  text?: string;
  awayScore: number;
  homeScore: number;
  period: { number: number };
  /** `value` is seconds left in the period. */
  clock: { value: number; displayValue: string };
  scoringPlay: boolean;
  scoreValue: number;
  /** ISO time the play happened. */
  wallclock: string;
  /** ISO time, minute precision, of the last correction. */
  modified?: string;
  team?: Ref;
  possessionTeam?: Ref;
  /** An entry can be null, e.g. a technical foul on someone not on the roster (401810405). */
  participants?: ({ athlete: Ref; type?: string; order?: number } | null)[];
}

export interface CorePlayPage {
  count: number;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  items: CorePlay[];
}

/** The site API's `summary?event={id}`. */
export interface Summary {
  header: {
    id: string;
    season: { year: number; type: number };
    competitions: {
      competitors: {
        homeAway: 'home' | 'away';
        team: { id: string; abbreviation: string; displayName: string; color?: string };
        score?: string;
        linescores?: { displayValue: string }[];
      }[];
      status: { type: { name: string; completed: boolean } };
    }[];
  };
  boxscore: {
    players?: {
      team: { id: string };
      statistics: {
        names: string[];
        athletes: { athlete: { id: string; displayName: string; shortName: string }; stats: string[] }[];
      }[];
    }[];
  };
}

/** The site API's `scoreboard?dates=YYYYMMDD`. */
export interface Scoreboard {
  events: {
    id: string;
    date: string;
    status: { clock: number; period: number; type: { name: string } };
    competitions: {
      competitors: {
        homeAway: 'home' | 'away';
        team: { id: string; abbreviation: string; displayName: string; color?: string };
        score?: string;
      }[];
    }[];
  }[];
}

/** What the adapter needs for one game: the summary once, plus the core API's plays. */
export interface GameFeed {
  summary: Summary;
  plays: CorePlay[];
}

/** The numeric id at the end of a core API ref such as `.../teams/7?lang=en`. */
export function refId(ref: Ref | undefined, kind: 'teams' | 'athletes'): string | undefined {
  return ref?.$ref.match(new RegExp(`/${kind}/(\\d+)`))?.[1];
}
