import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog'
import { Select, SelectTrigger, SelectValue } from '../select'

describe('Dialog and Select UI contract', () => {
  it('keeps the dialog close button at a touch-friendly size', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>测试弹窗</DialogTitle>
          <DialogDescription>测试弹窗说明</DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    const closeButton = screen.getByRole('button', { name: '关闭对话框' })
    expect(closeButton.className).toContain('min-h-11')
    expect(closeButton.className).toContain('min-w-11')
    expect(closeButton.className).toContain('focus-visible:ring-2')
  })

  it('uses focus-visible on select trigger', () => {
    render(
      <Select>
        <SelectTrigger aria-label="选择状态">
          <SelectValue placeholder="选择状态" />
        </SelectTrigger>
      </Select>,
    )

    const trigger = screen.getByRole('combobox', { name: '选择状态' })
    expect(trigger.className).toContain('focus-visible:ring-2')
    expect(trigger.className).not.toContain('focus:ring-2')
  })
})
