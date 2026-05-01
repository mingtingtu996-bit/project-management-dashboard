/**
 * 用户反馈组件
 * 收集用户反馈信息
 */

import { useState } from 'react'
import { MessageSquare, Send, CheckCircle } from 'lucide-react'
import { z } from 'zod'
import { getBrowserStorage, safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface FeedbackData {
  type: 'bug' | 'feature' | 'improvement' | 'other'
  title: string
  description: string
  contact?: string
  screenshots?: string[]
  timestamp: number
  userId?: string
}

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit?: (feedback: FeedbackData) => void
}

const FeedbackDataSchema = z.object({
  type: z.enum(['bug', 'feature', 'improvement', 'other']),
  title: z.string(),
  description: z.string(),
  contact: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
  timestamp: z.number(),
  userId: z.string().optional(),
})

const FeedbackDataListSchema = z.array(FeedbackDataSchema)

export default function FeedbackModal({ isOpen, onClose, onSubmit }: FeedbackModalProps) {
  const [type, setType] = useState<FeedbackData['type']>('improvement')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contact, setContact] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const feedback: FeedbackData = {
      type,
      title,
      description,
      contact,
      timestamp: Date.now(),
    }

    // 保存到本地存储
    const storage = getBrowserStorage()
    if (storage) {
      const existingFeedback = FeedbackDataListSchema.safeParse(
        safeJsonParse<unknown>(
          safeStorageGet(storage, 'user_feedback'),
          [],
          'user_feedback',
        ),
      )
      const nextFeedback = existingFeedback.success ? existingFeedback.data : []
      nextFeedback.push(feedback)
      safeStorageSet(storage, 'user_feedback', JSON.stringify(nextFeedback))
    }

    // 回调
    onSubmit?.(feedback)
    
    setIsSubmitted(true)
    setTimeout(() => {
      setIsSubmitted(false)
      setTitle('')
      setDescription('')
      setContact('')
      onClose()
    }, 1500)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent className="max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            提交反馈
          </DialogTitle>
          <DialogDescription>提交产品问题、功能建议或其他反馈。</DialogDescription>
        </DialogHeader>

        {/* 内容 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {isSubmitted ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-2" />
              <p className="font-medium">感谢您的反馈！</p>
            </div>
          ) : (
            <>
              {/* 反馈类型 */}
              <div>
                <label className="block text-sm font-medium mb-1">反馈类型</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['bug', 'feature', 'improvement', 'other'] as const).map((t) => (
                    <Button variant="ghost"
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={cn(
                        "px-3 py-2 text-sm rounded-md border transition-colors",
                        type === t 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "hover:bg-accent"
                      )}
                    >
                      {t === 'bug' && '🐛 缺陷'}
                      {t === 'feature' && '✨ 新功能'}
                      {t === 'improvement' && '💡 改进建议'}
                      {t === 'other' && '💬 其他'}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 标题 */}
              <div>
                <label className="block text-sm font-medium mb-1">标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="请简要描述问题或建议"
                  required
                  className="w-full px-3 py-2 border rounded-md bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-sm font-medium mb-1">详细描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="请详细描述您遇到的问题或建议..."
                  required
                  rows={4}
                  className="w-full px-3 py-2 border rounded-md bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-none"
                />
              </div>

              {/* 联系方式 */}
              <div>
                <label className="block text-sm font-medium mb-1">联系方式（可选）</label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="邮箱或微信"
                  className="w-full px-3 py-2 border rounded-md bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              {/* 提交按钮 */}
              <Button
                type="submit"
                className="w-full gap-2"
              >
                <Send className="h-4 w-4" />
                提交反馈
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

// 反馈按钮组件（可添加到页面）
export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost"
        onClick={() => setIsOpen(true)}
        aria-label="打开反馈"
        data-overlap-ignore="true"
        className="fixed bottom-5 right-5 z-30 h-11 w-11 rounded-full bg-primary p-0 text-primary-foreground shadow-lg transition-all hover:shadow-[var(--el-3)] hover:bg-primary/90"
        
      >
        <MessageSquare className="h-5 w-5" />
      </Button>
  </TooltipTrigger>
  <TooltipContent>反馈</TooltipContent>
</Tooltip>
      <FeedbackModal 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  )
}
