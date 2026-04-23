import { describe, expect, it } from 'vitest'

import { evaluateDrawingReviewRule, getReviewModeLabel } from '../services/drawingPackageService.js'

describe('drawing review rule evaluation', () => {
  it('marks fire and civil defense packages as mandatory review', () => {
    const fire = evaluateDrawingReviewRule({
      disciplineType: '消防',
      documentPurpose: '送审报批',
      packageCode: 'fire-review',
      packageName: '消防专项包',
    })

    expect(fire).toEqual({
      requiresReview: true,
      reviewMode: 'mandatory',
      reviewBasis: '消防专项包默认必审',
    })
    expect(getReviewModeLabel(fire.reviewMode)).toBe('必审')
  })

  it('keeps completion archive packages in manual confirmation mode', () => {
    const archive = evaluateDrawingReviewRule({
      disciplineType: '竣工归档',
      documentPurpose: '竣工归档',
      packageCode: 'completion-archive',
      packageName: '竣工归档包',
    })

    expect(archive).toEqual({
      requiresReview: true,
      reviewMode: 'manual_confirm',
      reviewBasis: '竣工归档包需要人工确认',
    })
    expect(getReviewModeLabel(archive.reviewMode)).toBe('人工确认')
  })

  it('defaults execution packages to no review', () => {
    const execution = evaluateDrawingReviewRule({
      disciplineType: '建筑',
      documentPurpose: '施工执行',
      packageCode: 'architecture-construction',
      packageName: '建筑施工图包',
    })

    expect(execution).toEqual({
      requiresReview: false,
      reviewMode: 'none',
      reviewBasis: '常规施工执行包默认不送审',
    })
  })
})

