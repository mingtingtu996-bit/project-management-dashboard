import type { MouseEvent } from 'react'

type SkipLinkProps = {
  targetId: string
  label?: string
  className?: string
}

export function SkipLink({
  targetId,
  label = '跳转到主内容',
  className = 'skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-[var(--el-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
}: SkipLinkProps) {
  const focusTarget = () => {
    const target = document.getElementById(targetId)
    if (!target) return

    target.scrollIntoView({ block: 'start', behavior: 'auto' })
    target.focus()
  }

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    focusTarget()
  }

  return (
    <a
      href={`#${targetId}`}
      className={className}
      onClick={handleClick}
    >
      {label}
    </a>
  )
}
