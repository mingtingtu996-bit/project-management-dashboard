// 在线成员列表组件
// 显示项目的在线成员和在线状态

import { useState, useEffect } from 'react'
import { realtimeService, OnlineMember } from '@/lib/realtimeService'
import { Users, Circle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface OnlineMembersProps {
  projectId: string
}

export default function OnlineMembers({ projectId }: OnlineMembersProps) {
  const [members, setMembers] = useState<OnlineMember[]>([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!realtimeService.isReady()) {
      realtimeService.initialize()
    }

    // 订阅在线状态
    const unsubscribe = realtimeService.subscribeToPresence(projectId, (onlineMembers) => {
      setMembers(onlineMembers)
      setIsConnected(true)
    })

    // 页面卸载时取消订阅
    return () => {
      unsubscribe()
    }
  }, [projectId])

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          团队成员
          {isConnected && (
            <span className="text-xs text-green-600 ml-auto flex items-center gap-1">
              <Circle className="h-2 w-2 fill-current" />
              在线
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            暂无其他成员在线
          </p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 text-sm"
              >
                <div className="relative">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.display_name}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium">
                        {member.display_name.charAt(0)}
                      </span>
                    </div>
                  )}
                  {member.is_online && (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{member.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.is_online ? '在线' : `最后活跃: ${formatLastActive(member.last_active)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// 格式化最后活跃时间
function formatLastActive(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  return `${days}天前`
}
