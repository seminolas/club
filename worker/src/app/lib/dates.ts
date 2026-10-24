/** The next Tuesday (today if it's Tuesday), as YYYY-MM-DD in local time. */
export function nextTuesday(fromDate?: string | Date): string {
  const d = fromDate ? new Date(fromDate) : new Date()
  const day = d.getDay()
  const daysUntilTuesday = day === 2 ? 0 : (2 - day + 7) % 7
  d.setDate(d.getDate() + daysUntilTuesday)
  // Use local date parts to avoid UTC offset issues (important for NZ timezone)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
