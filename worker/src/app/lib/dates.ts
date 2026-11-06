/**
 * The club's next night (today if it's that day), as YYYY-MM-DD in local
 * time. `weekday`: 0 Sunday … 6 Saturday; without one (not set), today.
 */
export function nextNight(
  weekday: number | null,
  fromDate?: string | Date,
): string {
  const d = fromDate ? new Date(fromDate) : new Date()
  if (weekday !== null)
    d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7))
  // Use local date parts to avoid UTC offset issues (important for NZ timezone)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
