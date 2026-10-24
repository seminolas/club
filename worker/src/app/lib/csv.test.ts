import { describe, expect, it } from 'vitest'
import { generateLeaderboardCSV, parseLeaderboardCSV } from './csv'

describe('ladder CSV', () => {
  it('round-trips', () => {
    const names = ['Aroha Ngata', 'Ben Carter', '*Chloe Wu*']
    const csv = generateLeaderboardCSV(names, '2026-10-20')
    expect(csv.split('\r\n')[1]).toBe(
      ',"Tuesday, October 20, 2026",Attend,Signature',
    )
    expect(parseLeaderboardCSV(csv)).toEqual(names)
  })

  it('reads tab-separated rows in position order and skips the rest', () => {
    expect(
      parseLeaderboardCSV('Title\n2\tBen\n1\tAroha\nx\tNope\n3\t\n'),
    ).toEqual(['Aroha', 'Ben'])
  })
})
