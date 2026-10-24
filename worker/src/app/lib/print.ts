// Printouts, ported from the old UI so they come out the same.
import { longDate } from './csv'

/**
 * The sign-in sheet ("Box Doubles Draw"): the ladder with colour-graded
 * numbers and Attend / Signature columns, in a new window that prints itself
 * (old UI: printLadder). Returns false if the pop-up was blocked.
 */
export function printSignInSheet(isoDate: string, players: string[]): boolean {
  const n = players.length
  const stops = [
    [0.0, 59, 130, 246],
    [0.25, 8, 145, 178],
    [0.38, 101, 163, 13],
    [0.5, 202, 138, 4],
    [0.63, 249, 115, 22],
    [0.78, 239, 68, 68],
    [1.0, 252, 165, 165],
  ]
  const lerp = (idx: number) => {
    const t = n <= 1 ? 0 : idx / (n - 1)
    let lo = stops[0]
    let hi = stops[stops.length - 1]
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k][0] && t <= stops[k + 1][0]) {
        lo = stops[k]
        hi = stops[k + 1]
        break
      }
    }
    const u = hi[0] === lo[0] ? 0 : (t - lo[0]) / (hi[0] - lo[0])
    const c = (i: number) => Math.round(lo[i] + (hi[i] - lo[i]) * u)
    return `rgb(${c(1)},${c(2)},${c(3)})`
  }
  const rows = players
    .map((name, i) => {
      const esc = name
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `<tr><td class="n" style="background:${lerp(i)}">${i + 1}</td><td>${esc}</td><td></td><td></td></tr>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Box Doubles Draw</title>
<style>
@page{size:A4 portrait;margin:1.5cm}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Arial,Helvetica,sans-serif;font-size:14pt}
table{width:100%;border-collapse:collapse}
tr{page-break-inside:avoid;break-inside:avoid}
td{border:1.5pt solid #000;padding:1pt 5pt;vertical-align:middle}
.n{width:36pt;text-align:center;font-weight:bold}
.ht{font-weight:bold;text-align:center}
.hd{font-weight:bold;text-align:center}
.ha{width:85pt;font-weight:bold;text-align:center}
.hs{width:85pt;font-weight:bold;text-align:center}
</style>
</head>
<body>
<table><tbody>
<tr><td class="n"></td><td class="ht">Box Doubles Draw</td><td class="ha"></td><td class="hs"></td></tr>
<tr><td class="n"></td><td class="hd">${isoDate ? longDate(isoDate) : ''}</td><td class="ha">Attend</td><td class="hs">Signature</td></tr>
<tr><td></td><td>&nbsp;</td><td></td><td></td></tr>
<tr><td></td><td>&nbsp;</td><td></td><td></td></tr>
${rows}
</tbody></table>
<script>window.print()</${'script'}>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}
