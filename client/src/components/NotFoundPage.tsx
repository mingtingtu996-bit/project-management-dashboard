import { FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="page-shell flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <FileQuestion className="h-12 w-12 text-slate-400" />
      <h2 className="text-lg font-semibold text-slate-900">页面不存在</h2>
      <p className="text-sm text-slate-500">请检查地址是否正确</p>
      <Button asChild>
        <Link to="/company">返回首页</Link>
      </Button>
    </div>
  )
}
