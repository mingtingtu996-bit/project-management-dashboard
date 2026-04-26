import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { AssigneeCombobox, type AssigneeComboboxValue } from '../AssigneeCombobox'

function Harness() {
  const [value, setValue] = useState<AssigneeComboboxValue>({
    assignee_name: '',
    assignee_user_id: null,
  })

  return (
    <div>
      <AssigneeCombobox
        members={[
          { userId: 'u-1', displayName: '张三', permissionLevel: 'owner' },
          { userId: 'u-2', displayName: '李四', permissionLevel: 'editor' },
        ]}
        valueName={value.assignee_name}
        valueUserId={value.assignee_user_id}
        onChange={setValue}
      />
      <output data-testid="assignee-state">{JSON.stringify(value)}</output>
    </div>
  )
}

describe('AssigneeCombobox', () => {
  it('keeps free text responsibility names as manual entries', async () => {
    render(<Harness />)

    const input = screen.getByTestId('gantt-assignee-combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '外部责任人' } })

    await waitFor(() => {
      expect(screen.getByTestId('assignee-state').textContent).toContain('"assignee_name":"外部责任人"')
      expect(screen.getByTestId('assignee-state').textContent).toContain('"assignee_user_id":null')
    })
  })

  it('lets users pick a project member from the searchable dropdown', async () => {
    render(<Harness />)

    const input = screen.getByTestId('gantt-assignee-combobox')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '张' } })
    fireEvent.click(screen.getByTestId('gantt-assignee-option-u-1'))

    await waitFor(() => {
      expect(screen.getByTestId('gantt-assignee-combobox')).toHaveValue('张三')
      expect(screen.getByTestId('assignee-state').textContent).toContain('"assignee_name":"张三"')
      expect(screen.getByTestId('assignee-state').textContent).toContain('"assignee_user_id":"u-1"')
    })
  })
})
