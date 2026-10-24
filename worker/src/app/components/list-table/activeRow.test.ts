import { describe, expect, it } from 'vitest'
import { defaultActive, moveActive } from './activeRow'

describe('moveActive', () => {
  it('starts at the top going down and at the bottom going up', () => {
    expect(moveActive(null, 4, 'ArrowDown')).toBe(0)
    expect(moveActive(null, 4, 'ArrowUp')).toBe(3)
  })
  it('wraps at both ends', () => {
    expect(moveActive(3, 4, 'ArrowDown')).toBe(0)
    expect(moveActive(0, 4, 'ArrowUp')).toBe(3)
    expect(moveActive(1, 4, 'ArrowDown')).toBe(2)
  })
  it('has nothing to move to in an empty list', () => {
    expect(moveActive(null, 0, 'ArrowDown')).toBeNull()
  })
})

describe('defaultActive', () => {
  it('activates the first match only while searching', () => {
    expect(defaultActive(true, 3)).toBe(0)
    expect(defaultActive(false, 3)).toBeNull()
    expect(defaultActive(true, 0)).toBeNull()
  })
})
