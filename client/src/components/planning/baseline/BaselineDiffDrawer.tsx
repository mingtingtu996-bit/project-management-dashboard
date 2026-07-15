import { FileDiff } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { BaselineDiffView, type BaselineDiffItem } from './BaselineDiffView'

export interface BaselineDiffDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fromVersionLabel: string
  toVersionLabel: string
  items: BaselineDiffItem[]
  loading?: boolean
  error?: string | null
  onLocateItem?: (item: BaselineDiffItem) => void
}

export function BaselineDiffDrawer({
  open,
  onOpenChange,
  fromVersionLabel,
  toVersionLabel,
  items,
  loading = false,
  error = null,
  onLocateItem,
}: BaselineDiffDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        centered={false}
        data-testid="baseline-current-diff-drawer"
        className="left-auto right-0 top-0 h-screen w-[min(100vw,760px)] max-w-none overflow-hidden rounded-none border-y-0 border-r-0 p-0 shadow-[var(--el-4)] sm:rounded-l-2xl"
      >
        <DialogHeader className="border-b border-slate-100 p-6 pb-4 pr-16">
          <div className="flex items-center gap-3">
            <FileDiff className="h-5 w-5 text-blue-600" />
            <div>
              <DialogTitle className="text-2xl">对比当前生效版本</DialogTitle>
              <DialogDescription>当前查看版本与当前生效基线的行级差异。</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="h-[calc(100vh-96px)] overflow-y-auto p-6">
          {error ? (
            <Alert variant="destructive" data-testid="baseline-diff-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div
              data-testid="baseline-diff-loading"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"
            >
              正在加载当前生效版本差异...
            </div>
          ) : null}
          {!loading && !error ? (
            <BaselineDiffView
              fromVersionLabel={fromVersionLabel}
              toVersionLabel={toVersionLabel}
              items={items}
              onLocateItem={onLocateItem}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default BaselineDiffDrawer
