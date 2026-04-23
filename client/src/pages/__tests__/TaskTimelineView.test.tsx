import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readTaskTimelineViewSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/TaskTimelineView.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/TaskTimelineView.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // try next workspace root
    }
  }

  throw new Error(`Unable to locate TaskTimelineView.tsx in: ${candidates.join(', ')}`)
}

describe('TaskTimelineView source contracts', () => {
  it('keeps the desktop fallback and oversize guardrails for timeline mode', () => {
    const source = readTaskTimelineViewSource()

    expect(source.includes('gantt-timeline-mobile-fallback')).toBe(true)
    expect(source.includes('gantt-timeline-too-many')).toBe(true)
    expect(source.includes('TIMELINE_LIMIT = 500')).toBe(true)
    expect(source.includes('VIRTUALIZE_AFTER = 200')).toBe(true)
  })

  it('keeps baseline compare controls and today scrolling wired in the timeline shell', () => {
    const source = readTaskTimelineViewSource()

    expect(source.includes('gantt-timeline-baseline-select')).toBe(true)
    expect(source.includes("gantt-timeline-compare-baseline")).toBe(true)
    expect(source.includes('scrollToToday')).toBe(true)
    expect(source.includes('TaskTimelineViewHandle')).toBe(true)
  })
})
