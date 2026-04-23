import { useState } from 'react'

export function usePlanningKeyboard(initialOpen = false) {
  const [open, setOpen] = useState(initialOpen)

  return {
    open,
    setOpen,
  }
}

export default usePlanningKeyboard
