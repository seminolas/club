// A small, realistic club for database tests. Names are made up (the repo is
// public). Shaped like prod data, and covering the cases queries care about:
// seed ladder rows (session_id NULL), a closed session with full scores and
// before/after ladders, a session mid-games with partial scores and a player
// added mid-session, an archived player, a second club sharing a name and a
// date, a club with a seed ladder but no sessions, and sign-in profiles
// and roles.
import { getPairings } from '../../domain/pairings'
import type { DB } from '../../db'

type Row = Record<string, string | number | null>

const players: Row[] = [
  {
    id: 1,
    club_id: 1,
    name: 'Aroha Ngata',
    hc_member_id: 'hc-0001',
    email: 'aroha@example.test',
  },
  { id: 2, club_id: 1, name: 'Ben Carter', preferred_name: 'Benny' },
  { id: 3, club_id: 1, name: 'Chloe Wu', hc_member_id: 'hc-0003' },
  { id: 4, club_id: 1, name: 'Dev Patel' },
  { id: 5, club_id: 1, name: 'Dev Singh' },
  { id: 6, club_id: 1, name: 'Ella Brown' },
  { id: 7, club_id: 1, name: 'Finn O’Neill' },
  { id: 8, club_id: 1, name: 'Grace Hohaia' },
  { id: 9, club_id: 1, name: 'Hemi Walker' },
  { id: 10, club_id: 1, name: 'Isla Martin' },
  { id: 11, club_id: 1, name: 'Jack Lee' },
  { id: 12, club_id: 1, name: 'Kiri Tane' },
  { id: 13, club_id: 1, name: 'Liam Gone', archived_at: '2026-01-02' },
  { id: 14, club_id: 1, name: 'Mia Late' },
  { id: 15, club_id: 2, name: 'Aroha Ngata' },
  { id: 16, club_id: 2, name: 'Zed Other' },
  // A new club with a seed ladder but no sessions yet.
  { id: 17, club_id: 3, name: 'Nora First' },
  { id: 18, club_id: 3, name: 'Otis Second' },
]

// Boxes: player ids in box order, and per match the sets (pair1 score first).
type SeedBox = { players: number[]; sets: (number | null)[][][] }

const sessions: {
  row: Row
  before?: number[]
  after?: number[]
  attendees: number[]
  boxes: SeedBox[]
}[] = [
  {
    row: {
      id: 1,
      club_id: 1,
      date: '2026-01-06',
      status: 'closed',
      created_at: '2026-01-06 05:00:00',
      closed_at: '2026-01-06T09:30:00.000Z',
    },
    before: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    after: [1, 2, 5, 6, 3, 4, 7, 8, 9, 10, 11, 12],
    attendees: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    boxes: [
      {
        players: [1, 2, 3, 4],
        sets: [
          [
            [21, 15],
            [21, 18],
          ],
          [
            [19, 21],
            [21, 17],
            [21, 12],
          ],
          [
            [30, 29],
            [15, 21],
            [11, 7],
          ],
        ],
      },
      {
        players: [5, 6, 7, 8, 9],
        sets: [
          [
            [21, 10],
            [21, 9],
          ],
          [
            [22, 20],
            [21, 19],
          ],
          [
            [15, 13],
            [15, 9],
          ],
          [
            [21, 23],
            [21, 11],
            [21, 16],
          ],
          [
            [12, 21],
            [9, 21],
          ],
        ],
      },
    ],
  },
  {
    row: {
      id: 2,
      club_id: 1,
      date: '2026-01-13',
      status: 'games',
      created_at: '2026-01-13 05:00:00',
      closed_at: null,
    },
    before: [1, 2, 14, 5, 6, 3, 4, 7, 8, 9, 10, 11, 12],
    attendees: [1, 2, 14, 5, 6, 3, 4, 7, 10],
    boxes: [
      {
        players: [1, 2, 14, 5],
        sets: [
          [
            [21, 15],
            [18, 21],
          ],
          [[21, null]],
          [],
        ],
      },
      {
        players: [6, 3, 4, 7, 10],
        sets: [
          [
            [21, 19],
            [21, 17],
          ],
          [],
          [[null, 11]],
          [],
          [],
        ],
      },
    ],
  },
  {
    row: {
      id: 3,
      club_id: 2,
      date: '2026-01-13',
      status: 'attendance',
      created_at: '2026-01-13 06:00:00',
      closed_at: null,
    },
    before: [15, 16],
    attendees: [15],
    boxes: [],
  },
  {
    // An older session nobody was marked at (no attendees, ladders or boxes).
    row: {
      id: 4,
      club_id: 1,
      date: '2025-12-30',
      status: 'attendance',
      created_at: '2025-12-30 05:00:00',
      closed_at: null,
    },
    attendees: [],
    boxes: [],
  },
]

const insert = (db: DB, table: string, row: Row) => {
  const cols = Object.keys(row)
  return db
    .prepare(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    )
    .bind(...cols.map((c) => row[c]))
}

export async function seed(db: DB): Promise<void> {
  const stmts: D1PreparedStatement[] = [
    insert(db, 'clubs', {
      id: 1,
      name: 'Test Club',
      short_name: 'TC',
      config: JSON.stringify({
        timezone: 'Pacific/Auckland',
        hcSubdomain: 'testclub',
      }),
    }),
    insert(db, 'clubs', {
      id: 2,
      name: 'Other Club',
      short_name: null,
      config: '{}',
    }),
    insert(db, 'clubs', {
      id: 3,
      name: 'New Club',
      short_name: null,
      config: '{}',
    }),
    ...players.map((p) => insert(db, 'players', p)),
    // The new club's seed ladder (seed rows are one list across clubs).
    ...[18, 17].map((pid, i) =>
      insert(db, 'session_ranks', {
        session_id: null,
        player_id: pid,
        rank_position: 14 + i,
        phase: 'after',
      }),
    ),
    // Seed ladder (before any session); includes the archived player.
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((pid, i) =>
      insert(db, 'session_ranks', {
        session_id: null,
        player_id: pid,
        rank_position: i + 1,
        phase: 'after',
      }),
    ),
    insert(db, 'player_auth_profiles', {
      player_id: 1,
      provider: 'google',
      provider_id: 'sub-aroha',
      email: 'aroha@example.test',
    }),
    insert(db, 'player_auth_profiles', {
      player_id: 13,
      provider: 'google',
      provider_id: 'sub-liam',
      email: null,
    }),
    insert(db, 'player_roles', { player_id: 1, role_id: 1 }),
    insert(db, 'player_roles', { player_id: 1, role_id: 2 }),
    insert(db, 'player_roles', { player_id: 3, role_id: 3 }),
  ]
  let boxId = 0
  let matchId = 0
  for (const s of sessions) {
    stmts.push(insert(db, 'sessions', s.row))
    for (const [phase, ids] of [
      ['before', s.before],
      ['after', s.after],
    ] as const) {
      ids?.forEach((pid, i) =>
        stmts.push(
          insert(db, 'session_ranks', {
            session_id: s.row.id,
            player_id: pid,
            rank_position: i + 1,
            phase,
          }),
        ),
      )
    }
    for (const pid of s.attendees)
      stmts.push(
        insert(db, 'attendees', { session_id: s.row.id, player_id: pid }),
      )
    s.boxes.forEach((box, bi) => {
      boxId++
      stmts.push(
        insert(db, 'boxes', {
          id: boxId,
          session_id: s.row.id,
          box_number: bi,
        }),
      )
      box.players.forEach((pid, pos) =>
        stmts.push(
          insert(db, 'box_players', {
            box_id: boxId,
            player_id: pid,
            position: pos,
          }),
        ),
      )
      getPairings(box.players.length).forEach((pairing, mi) => {
        matchId++
        stmts.push(
          insert(db, 'matches', {
            id: matchId,
            box_id: boxId,
            match_number: mi,
          }),
        )
        for (const [side, pair] of [
          [0, pairing.pair1],
          [1, pairing.pair2],
        ] as const) {
          for (const pos of pair)
            stmts.push(
              insert(db, 'match_players', {
                match_id: matchId,
                player_id: box.players[pos],
                side,
              }),
            )
        }
        ;(box.sets[mi] ?? []).forEach(([a, b], si) =>
          stmts.push(
            insert(db, 'match_sets', {
              match_id: matchId,
              set_number: si,
              score_a: a,
              score_b: b,
            }),
          ),
        )
      })
    })
  }
  await db.batch(stmts)
}
