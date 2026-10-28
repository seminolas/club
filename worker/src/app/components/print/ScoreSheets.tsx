// The printed score sheets, one box per page, in the old UI's two layouts
// (index.html #print-area): "cards" (a card per match, like the paper sheets)
// and "grid" (a row per match, a column per player). Rendered into
// <body> and shown only when printing (ScoreSheets.css).
import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSitOut } from '../../../domain/pairings'
import type { SessionBox } from '../../lib/session'
import './ScoreSheets.css'

export type SheetLayout = 'cards' | 'grid'

/** Card height (mm): fits the card's fixed content (old UI: cardHeightMm). */
const CARD_MM = 42

export function ScoreSheets(props: {
  boxes: SessionBox[]
  layout: SheetLayout
  /** Display name per player id (the score sheets' rule). */
  label: (id: number) => string
}) {
  // Only in the browser: there's no <body> to portal into on the server.
  const [body, setBody] = useState<HTMLElement | null>(null)
  useEffect(() => setBody(document.body), [])
  if (!body) return null
  return createPortal(
    <div id="club-print">
      {props.boxes.map((box, bi) => (
        <div
          key={bi}
          className={bi < props.boxes.length - 1 ? 'ps-page-break' : undefined}
        >
          {props.layout === 'cards' ? (
            <CardsSheet box={box} index={bi} label={props.label} />
          ) : (
            <GridSheet box={box} index={bi} label={props.label} />
          )}
        </div>
      ))}
    </div>,
    body,
  )
}

interface SheetProps {
  box: SessionBox
  index: number
  label: (id: number) => string
}

function CardsSheet({ box, index, label }: SheetProps) {
  const n = box.players.length
  const name = (pos: number) => label(box.players[pos].id)
  const sitOut = (mi: number) => getSitOut(n, mi).map(name).join(', ')
  return (
    <div className="ps-sheet">
      <div className="ps-head">
        <div className="ps-boxword">
          <span className="ps-xl">Box</span>
          <div className="ps-circle ps-xl">{index + 1}</div>
        </div>
        <div className="ps-xl ps-names">
          {box.players.map((_, pi) => name(pi)).join('  ·  ')}
        </div>
      </div>

      <div
        className="ps-cards"
        style={{ gridTemplateColumns: `repeat(${n > 6 ? 3 : 2}, 1fr)` }}
      >
        {box.matches.map((match, mi) => (
          <div key={mi} className="ps-card" style={{ height: `${CARD_MM}mm` }}>
            <div className="ps-pill ps-pill-game">MATCH {mi + 1}</div>
            {/* Boxes of 7 list who sits out on cards of their own below. */}
            {n > 4 && n <= 6 && (
              <div className="ps-sitout-pill">✕ {sitOut(mi)}</div>
            )}
            <Pair names={match.pair1.map(name)} />
            <div className="ps-sets">
              {[1, 2, 3].map((g) => (
                <div key={g} className="ps-set">
                  <div className="ps-score" />
                  <span className="ps-dash">−</span>
                  <div className="ps-score" />
                </div>
              ))}
            </div>
            <Pair names={match.pair2.map(name)} />
          </div>
        ))}
        {n > 6 &&
          sitOutCards(box, name).map((rows, ci) => (
            <div
              key={ci}
              className="ps-sitout-card"
              style={{ height: `${CARD_MM}mm` }}
            >
              <div className="ps-pill ps-pill-game">SITTING OUT OF MATCHES</div>
              <div className="ps-sitout-rows">
                {rows.map((row) => (
                  <div key={row.name} className="ps-sitout-row">
                    <span className="ps-sitout-name">{row.name}:</span>
                    <div className="ps-sitout-games">
                      {row.games.map((g) => (
                        <span key={g} className="ps-pill ps-pill-small">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      <div style={{ height: 24 }} />
      <table className="ps-table">
        <Cols n={n} />
        <thead>
          <tr>
            <th className="ps-bg ps-c ps-px3 ps-py1 ps-sm ps-bold ps-up">
              Totals
            </th>
            {box.players.map((_, pi) => (
              <th
                key={pi}
                className="ps-c ps-px2 ps-py1 ps-bold ps-sm ps-up ps-tight"
              >
                {name(pi)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {['Matches Won', 'Games (Won − Lost)', 'Points (For − Against)'].map(
            (t) => (
              <tr key={t}>
                <td className="ps-b ps-px3 ps-py1 ps-c ps-bold ps-sm ps-up ps-nowrap">
                  {t}
                </td>
                <Blanks n={n} className="ps-b ps-py1" />
              </tr>
            ),
          )}
        </tbody>
      </table>
      <div style={{ height: 6 }} />
      <FinalPlacing n={n} padding="ps-py1" />
    </div>
  )
}

function GridSheet({ box, index, label }: SheetProps) {
  const n = box.players.length
  const name = (pos: number) => label(box.players[pos].id)
  const totals = [
    ['Matches Won'],
    ['Games', '(Won − Lost)'],
    ['Points', '(For − Against)'],
  ]
  return (
    <div className="ps-sheet ps-grid-sheet">
      <div className="ps-head ps-head-grid">
        <div className="ps-circle ps-xl">{index + 1}</div>
        <span className="ps-xl">Box {index + 1}</span>
      </div>

      <table className="ps-table">
        <Cols n={n} />
        <thead>
          <tr>
            <th className="ps-bg ps-c ps-px3 ps-py3 ps-base ps-bold ps-up">
              Pairing
            </th>
            {box.players.map((_, pi) => (
              <th
                key={pi}
                className="ps-c ps-px2 ps-py3 ps-bold ps-base ps-up ps-tight"
              >
                {name(pi)}
              </th>
            ))}
          </tr>
          <tr>
            <td
              className="ps-px3 ps-py2 ps-xs ps-gray"
              style={{ borderLeftStyle: 'hidden' }}
            />
            {box.players.map((_, pi) => (
              <td
                key={pi}
                className="ps-c ps-py2 ps-bold ps-base"
                style={
                  pi === n - 1 ? { borderRightStyle: 'hidden' } : undefined
                }
              >
                {pi + 1}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {box.matches.map((match, mi) => {
            const out = getSitOut(n, mi)
            return (
              <tr key={mi}>
                <td className="ps-b ps-px3 ps-py7 ps-c ps-bold ps-base">
                  {`${match.pair1.map((i) => i + 1).join(' & ')}  v  ${match.pair2.map((i) => i + 1).join(' & ')}`}
                </td>
                {box.players.map((_, pi) => (
                  <td
                    key={pi}
                    className={`ps-b ps-c ps-py7${out.includes(pi) ? ' ps-sitout-cell' : ''}`}
                  />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ height: 14 }} />
      {/* Boxes of 6/7 have more match rows above, so their totals are
          tighter, to keep Final Placing on the same page. */}
      <table className="ps-table">
        <Cols n={n} />
        <tbody>
          {totals.map((t) => (
            <tr key={t[0]}>
              {n <= 5 ? (
                <td className="ps-b ps-px3 ps-py4 ps-c ps-bold ps-base ps-up">
                  {t.map((line, i) => (
                    <Fragment key={line}>
                      {i > 0 && <br />}
                      {line}
                    </Fragment>
                  ))}
                </td>
              ) : (
                <td className="ps-b ps-px3 ps-py1 ps-c ps-bold ps-sm ps-up ps-nowrap">
                  {t.join(' ')}
                </td>
              )}
              <Blanks
                n={n}
                className={`ps-b ${n <= 5 ? 'ps-py4' : 'ps-py1'}`}
              />
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ height: 14 }} />
      <FinalPlacing n={n} padding="ps-py2" />
    </div>
  )
}

function Pair(props: { names: string[] }) {
  return (
    <div className="ps-pair">
      <span>{props.names[0]}</span>
      <span className="ps-amp">&amp;</span>
      <span>{props.names[1]}</span>
    </div>
  )
}

function Cols(props: { n: number }) {
  return (
    <colgroup>
      <col style={{ width: '26%' }} />
      {Array.from({ length: props.n }, (_, i) => (
        <col key={i} />
      ))}
    </colgroup>
  )
}

function Blanks(props: { n: number; className: string }) {
  return Array.from({ length: props.n }, (_, i) => (
    <td key={i} className={props.className} />
  ))
}

function FinalPlacing(props: { n: number; padding: string }) {
  return (
    <table className="ps-table">
      <Cols n={props.n} />
      <tbody>
        <tr>
          <td
            className={`ps-b ps-px3 ${props.padding} ps-c ps-bold ps-base ps-up`}
          >
            Final Placing
          </td>
          <Blanks n={props.n} className={`ps-b ${props.padding}`} />
        </tr>
      </tbody>
    </table>
  )
}

/**
 * Box of 7: one "Name: Game N, Game M, …" line per player who sits out at
 * least once, up to 4 lines per card (old UI: sitoutCards).
 */
function sitOutCards(box: SessionBox, name: (pos: number) => string) {
  const byPlayer = box.players.map((): number[] => [])
  box.matches.forEach((_, mi) => {
    for (const pi of getSitOut(box.players.length, mi))
      byPlayer[pi].push(mi + 1)
  })
  const rows = byPlayer
    .map((games, pi) => ({ name: name(pi), games }))
    .filter((row) => row.games.length > 0)
  const cards: (typeof rows)[] = []
  for (let i = 0; i < rows.length; i += 4) cards.push(rows.slice(i, i + 4))
  return cards
}
