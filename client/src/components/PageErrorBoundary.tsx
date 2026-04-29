import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-shell flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <AlertTriangle className="h-12 w-12 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">页面加载出错</h2>
          <Button onClick={() => window.location.reload()}>刷新页面</Button>
        </div>
      )
    }

    return this.props.children
  }
}
