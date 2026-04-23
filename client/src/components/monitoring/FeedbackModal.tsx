/**
 * 用户反馈组件
 * 收集用户反馈信息
 */

import { useState } from 'react'
import { MessageSquare, Send, X, CheckCircle } from 'lucide-react'
import { z } from 'zod'
import { getBrowserStorage, safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { cn } from '@/lib/utils'

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* 模态框 */}
      <div className="relative bg-background border rounded-xl shadow-lg w-full max-w-md mx-4">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span className="font-medium">提交反馈</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {isSubmitted ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <p className="font-medium">感谢您的反馈！</p>
            </div>
          ) : (
            <>
              {/* 反馈类型 */}
              <div>
                <label className="block text-sm font-medium mb-1">反馈类型</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['bug', 'feature', 'improvement', 'other'] as const).map((t) => (
                    <button
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
                    </button>
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
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
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
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
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
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* 提交按钮 */}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 transition-colors"
              >
                <Send className="h-4 w-4" />
                提交反馈
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

// 反馈按钮组件（可添加到页面）
export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:bg-primary/90 transition-all hover:scale-110"
        title="反馈"
      >
        <MessageSquare className="h-5 w-5" />
      </button>
      <FeedbackModal 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  )
}
