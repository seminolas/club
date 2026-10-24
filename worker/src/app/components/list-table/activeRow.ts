// Keyboard rules for the active row (DECISIONS.md, "Rapid actions"), from the
// W3C APG "editable combobox with grid popup": focus stays in the search box,
// ↑/↓ move a highlighted row and wrap, Enter runs its primary action.

/**
 * The active row after a key press. `current` is null when no row is active;
 * `total` counts every stop (rows, plus "Add …" when offered).
 */
export function moveActive(
  current: number | null,
  total: number,
  key: 'ArrowDown' | 'ArrowUp',
): number | null {
  if (total === 0) return null
  if (current === null) return key === 'ArrowDown' ? 0 : total - 1
  return key === 'ArrowDown'
    ? (current + 1) % total
    : (current - 1 + total) % total
}

/** While searching, the first stop is active; with no search, none is. */
export function defaultActive(
  searching: boolean,
  total: number,
): number | null {
  return searching && total > 0 ? 0 : null
}
