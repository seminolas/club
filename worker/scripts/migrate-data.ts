/**
 * One-time data migration: current JSON files → D1.
 *
 * Usage (from worker/ directory):
 *   npx tsx scripts/migrate-data.ts --env prod    # production D1
 *   npx tsx scripts/migrate-data.ts --env staging # staging D1
 *
 * Prerequisites:
 *   - wrangler authenticated: wrangler login
 *   - D1 databases created and wrangler.toml IDs filled in
 *   - Run from the worker/ directory
 *
 * The script fetches the current JSON data from GitHub (public repo),
 * then uses wrangler d1 execute to insert it. It prints SQL so you can
 * inspect before running if you prefer.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ENV = process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : 'prod';
const DRY_RUN = process.argv.includes('--dry-run');

const GITHUB_RAW = 'https://raw.githubusercontent.com/seminolas/ladder/main';

// Club config — adjust if needed
const CLUB_CONFIG = {
  timezone: 'Pacific/Auckland',
  hcSubdomain: 'northlandbadminton',
  minBoxSize: 4,
  maxBoxSize: 5,
  setsPerMatch: 3,
};
const ADMIN_EMAIL = 'vilius.vaivada@unimarket.com';

interface HCMember { id: string; names: string[] }
interface LeaderboardFile { players: string[] }
interface SessionFile {
  date: string;
  status: string;
  attendees: string[];
  boxes: Array<{
    players: string[];
    matches: Array<{ pair1: number[]; pair2: number[]; sets: Array<[number | '', number | '']> }>;
    finalPlacings: unknown;
  }>;
  leaderboardBefore: string[];
  leaderboardAfter: string[] | null;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchSessionDates(): Promise<string[]> {
  const apiUrl = 'https://api.github.com/repos/seminolas/ladder/contents/data/sessions?ref=main';
  const res = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error(`GitHub API failed: ${res.status}`);
  const files = await res.json() as Array<{ name: string }>;
  return files
    .filter((f) => f.name.endsWith('.json'))
    .map((f) => f.name.replace('.json', ''))
    .sort();
}

function sql(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, str, i) => {
    const val = values[i - 1];
    if (val === null || val === undefined) return acc + 'NULL' + str;
    if (typeof val === 'number') return acc + val + str;
    return acc + `'${String(val).replace(/'/g, "''")}'` + str;
  }, strings[0]);
}

function execute(statement: string): void {
  if (DRY_RUN) {
    console.log(statement);
    return;
  }
  const dbFlag = ENV === 'staging' ? '--env staging' : '';
  const dbName = ENV === 'staging' ? 'club-staging' : 'club-prod';
  const tmpFile = path.join(process.cwd(), `_migrate_tmp_${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, statement);
  try {
    execSync(`wrangler d1 execute ${dbName} ${dbFlag} --file ${tmpFile}`, { stdio: 'inherit' });
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

async function main() {
  console.log(`\nMigrating to D1 (${ENV})${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  // 1. Fetch source data
  console.log('Fetching leaderboard...');
  const lb = await fetchJSON<LeaderboardFile>(`${GITHUB_RAW}/data/leaderboard.json`);

  console.log('Fetching HelloClub member mapping...');
  const hcMembers = await fetchJSON<HCMember[]>(`${GITHUB_RAW}/data/helloclub-members.json`);
  const nameToHcId = new Map<string, string>();
  for (const m of hcMembers) {
    for (const name of m.names) nameToHcId.set(name, m.id);
  }

  console.log('Fetching session list...');
  const sessionDates = await fetchSessionDates();
  console.log(`  Found ${sessionDates.length} sessions`);

  const sessions: SessionFile[] = [];
  for (const date of sessionDates) {
    console.log(`  Fetching session ${date}...`);
    const s = await fetchJSON<SessionFile>(`${GITHUB_RAW}/data/sessions/${date}.json`);
    sessions.push(s);
  }

  // 2. Insert club
  console.log('\nInserting club...');
  execute(sql`INSERT OR IGNORE INTO clubs (id, name, short_name, config) VALUES (1, ${'Northland Badminton'}, ${'NL'}, ${JSON.stringify(CLUB_CONFIG)})`);

  // 3. Insert admin
  console.log('Inserting admin...');
  execute(sql`INSERT OR IGNORE INTO club_admins (club_id, email, role) VALUES (1, ${ADMIN_EMAIL}, ${'owner'})`);

  // 4. Insert players (in leaderboard rank order)
  console.log(`Inserting ${lb.players.length} players...`);
  for (let i = 0; i < lb.players.length; i++) {
    const name = lb.players[i];
    const hcId = nameToHcId.get(name) ?? null;
    execute(sql`INSERT OR IGNORE INTO players (club_id, name, current_rank, hc_member_id) VALUES (1, ${name}, ${i + 1}, ${hcId})`);
  }

  // 5. Insert sessions
  for (const s of sessions) {
    console.log(`\nInserting session ${s.date} (${s.status})...`);
    execute(sql`INSERT OR IGNORE INTO sessions (club_id, date, status, created_at) VALUES (1, ${s.date}, ${s.status}, ${s.date + 'T00:00:00Z'})`);

    // Get session id — we select it back
    // Use a file-based approach: write a SELECT and parse
    const selectTmp = path.join(process.cwd(), `_sel_${Date.now()}.sql`);
    fs.writeFileSync(selectTmp, `SELECT id FROM sessions WHERE club_id=1 AND date='${s.date}';`);
    let sessionId: number | null = null;
    try {
      const dbFlag = ENV === 'staging' ? '--env staging' : '';
      const dbName = ENV === 'staging' ? 'club-staging' : 'club-prod';
      const out = execSync(`wrangler d1 execute ${dbName} ${dbFlag} --file ${selectTmp} --json`, { encoding: 'utf-8' });
      const parsed = JSON.parse(out) as Array<{ results: Array<{ id: number }> }>;
      sessionId = parsed[0]?.results[0]?.id ?? null;
    } finally {
      fs.unlinkSync(selectTmp);
    }

    if (sessionId === null) { console.warn(`  Could not get session ID for ${s.date}, skipping`); continue; }

    // Insert session_lb before
    for (let i = 0; i < s.leaderboardBefore.length; i++) {
      const name = s.leaderboardBefore[i];
      execute(sql`
        INSERT OR IGNORE INTO session_lb (session_id, player_id, rank_position, snapshot)
        SELECT ${sessionId}, p.id, ${i + 1}, ${'before'}
        FROM players p WHERE p.club_id = 1 AND p.name = ${name}
      `);
    }

    // Insert session_lb after
    if (s.leaderboardAfter) {
      for (let i = 0; i < s.leaderboardAfter.length; i++) {
        const name = s.leaderboardAfter[i];
        execute(sql`
          INSERT OR IGNORE INTO session_lb (session_id, player_id, rank_position, snapshot)
          SELECT ${sessionId}, p.id, ${i + 1}, ${'after'}
          FROM players p WHERE p.club_id = 1 AND p.name = ${name}
        `);
      }
    }

    // Insert attendees
    for (const name of s.attendees) {
      execute(sql`
        INSERT OR IGNORE INTO attendees (session_id, player_id)
        SELECT ${sessionId}, p.id FROM players p WHERE p.club_id = 1 AND p.name = ${name}
      `);
    }

    // Insert boxes, box_players, matches, match_sets
    for (let bi = 0; bi < s.boxes.length; bi++) {
      const box = s.boxes[bi];
      execute(sql`INSERT INTO boxes (session_id, box_number) VALUES (${sessionId}, ${bi})`);

      // Get box ID
      const selBox = path.join(process.cwd(), `_selbox_${Date.now()}.sql`);
      fs.writeFileSync(selBox, `SELECT id FROM boxes WHERE session_id=${sessionId} AND box_number=${bi};`);
      let boxId: number | null = null;
      try {
        const dbFlag = ENV === 'staging' ? '--env staging' : '';
        const dbName = ENV === 'staging' ? 'club-staging' : 'club-prod';
        const out = execSync(`wrangler d1 execute ${dbName} ${dbFlag} --file ${selBox} --json`, { encoding: 'utf-8' });
        const parsed = JSON.parse(out) as Array<{ results: Array<{ id: number }> }>;
        boxId = parsed[0]?.results[0]?.id ?? null;
      } finally {
        fs.unlinkSync(selBox);
      }

      if (boxId === null) { console.warn(`  Could not get box ID for session ${s.date} box ${bi}`); continue; }

      for (let pi = 0; pi < box.players.length; pi++) {
        execute(sql`
          INSERT OR IGNORE INTO box_players (box_id, player_id, position)
          SELECT ${boxId}, p.id, ${pi} FROM players p WHERE p.club_id = 1 AND p.name = ${box.players[pi]}
        `);
      }

      for (let mi = 0; mi < box.matches.length; mi++) {
        const match = box.matches[mi];
        execute(sql`INSERT INTO matches (box_id, match_number) VALUES (${boxId}, ${mi})`);

        // Get match ID
        const selMatch = path.join(process.cwd(), `_selmatch_${Date.now()}.sql`);
        fs.writeFileSync(selMatch, `SELECT id FROM matches WHERE box_id=${boxId} AND match_number=${mi};`);
        let matchId: number | null = null;
        try {
          const dbFlag = ENV === 'staging' ? '--env staging' : '';
          const dbName = ENV === 'staging' ? 'club-staging' : 'club-prod';
          const out = execSync(`wrangler d1 execute ${dbName} ${dbFlag} --file ${selMatch} --json`, { encoding: 'utf-8' });
          const parsed = JSON.parse(out) as Array<{ results: Array<{ id: number }> }>;
          matchId = parsed[0]?.results[0]?.id ?? null;
        } finally {
          fs.unlinkSync(selMatch);
        }

        if (matchId === null) continue;

        for (let si = 0; si < match.sets.length; si++) {
          const [a, b] = match.sets[si];
          if (a === '' && b === '') continue;
          execute(sql`INSERT OR IGNORE INTO match_sets (match_id, set_number, score_a, score_b) VALUES (${matchId}, ${si}, ${a === '' ? null : a}, ${b === '' ? null : b})`);
        }
      }
    }
  }

  console.log('\nMigration complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
