import { describe, expect, it } from 'vitest'

import { cn, formatDate, formatDateTime } from '../lib/utils'

describe('utility helpers', () => {
  describe('cn', () => {
    it('merges class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('filters false conditions', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    })
  })

  describe('formatDate', () => {
    it('formats Date values', () => {
      const result = formatDate(new Date('2024-01-15'))
      expect(result).toContain('2024')
      expect(result).toContain('15')
    })

    it('formats date strings', () => {
      expect(formatDate('2024-01-15')).toContain('2024')
    })
  })

  describe('formatDateTime', () => {
    it('includes date and time', () => {
      const result = formatDateTime(new Date('2024-01-15T10:30:00'))
      expect(result).toContain('2024')
      expect(result).toContain('10')
      expect(result).toContain('30')
    })
  })
})
