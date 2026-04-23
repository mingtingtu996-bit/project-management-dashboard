import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface UndoRedoContextValue {
  snapshotCount: number
  canUndo: boolean
  canRedo: boolean
  pushSnapshot: (snapshot: unknown) => void
  undo: () => unknown | undefined
  redo: () => unknown | undefined
}

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null)

interface UndoRedoProviderProps {
  children: ReactNode
}

export function UndoRedoProvider({ children }: UndoRedoProviderProps) {
  const historyRef = useRef<unknown[]>([])
  const cursorRef = useRef(-1)
  const [, forceRender] = useState(0)

  const pushSnapshot = useCallback((snapshot: unknown) => {
    historyRef.current = historyRef.current.slice(0, cursorRef.current + 1)
    historyRef.current.push(snapshot)
    cursorRef.current = historyRef.current.length - 1
    forceRender((value) => value + 1)
  }, [])

  const undo = useCallback(() => {
    if (cursorRef.current <= 0) return undefined
    cursorRef.current -= 1
    forceRender((value) => value + 1)
    return historyRef.current[cursorRef.current]
  }, [])

  const redo = useCallback(() => {
    if (cursorRef.current >= historyRef.current.length - 1) return undefined
    cursorRef.current += 1
    forceRender((value) => value + 1)
    return historyRef.current[cursorRef.current]
  }, [])

  const value: UndoRedoContextValue = {
    snapshotCount: historyRef.current.length,
    canUndo: cursorRef.current > 0,
    canRedo: cursorRef.current >= 0 && cursorRef.current < historyRef.current.length - 1,
    pushSnapshot,
    undo,
    redo,
  }

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>
}

export function useUndoRedo() {
  const context = useContext(UndoRedoContext)
  if (!context) {
    throw new Error('useUndoRedo must be used within UndoRedoProvider')
  }
  return context
}
