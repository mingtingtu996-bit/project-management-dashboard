import * as React from 'react'

import { cn } from '@/lib/utils'

const Separator = React.forwardRef<
  HTMLHRElement,
  React.HTMLAttributes<HTMLHRElement> & { orientation?: 'horizontal' | 'vertical' }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <hr
    ref={ref}
    className={cn(
      'shrink-0 border-slate-200',
      orientation === 'horizontal' ? 'h-[1px] w-full border-t' : 'h-full w-[1px] border-l',
      className,
    )}
    {...props}
  />
))
Separator.displayName = 'Separator'

export { Separator }
