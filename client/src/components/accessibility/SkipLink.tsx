import type { MouseEvent } from 'react'

type SkipLinkProps = {
  targetId: string
  label?: string
  className?: string
}

export function SkipLink({
  targetId,
  label = '跳到主要内容',
  className = 'skip-link sr-only fixed left-4 top-4 z-[120] rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-2 focus:ring-offset-white',
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
