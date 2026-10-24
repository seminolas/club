// The club's ladder CSV (from js/csv.js).

// Detects player rows by: col A is a positive integer, col B is a non-empty
// string. Handles any number of header rows and either delimiter (comma or
// tab). Returns player names in ladder order.
export function parseLeaderboardCSV(text: string): string[] {
  const players: { pos: number; name: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cols = (line.includes('\t') ? line.split('\t') : line.split(',')).map(
      (c) => c.trim().replace(/^"|"$/g, ''),
    )
    const [posCol, nameCol] = cols
    if (!nameCol || !nameCol.trim()) continue
    const pos = parseInt(posCol ?? '', 10)
    if (!Number.isInteger(pos) || pos <= 0) continue
    players.push({ pos, name: nameCol.trim() })
  }
  players.sort((a, b) => a.pos - b.pos)
  return players.map((p) => p.name)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** "Tuesday, October 20, 2026", as on the printed sheets. */
export function longDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// A ladder CSV that round-trips through parseLeaderboardCSV: header rows with
// title + date, then numbered player rows with two empty columns (Attend,
// Signature).
export function generateLeaderboardCSV(players: string[], isoDate: string) {
  return [
    ',Box Doubles Draw,,',
    `,"${longDate(isoDate)}",Attend,Signature`,
    ',,,',
    ',,,',
    ...players.map((name, i) => `${i + 1},${name},,`),
  ].join('\r\n')
}
