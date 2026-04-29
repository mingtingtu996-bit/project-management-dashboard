import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const cardVariants = cva('text-card-foreground transition-all duration-200', {
  variants: {
    variant: {
      default: 'rounded-card border border-slate-100 bg-white shadow-[var(--el-1)] hover:shadow-[var(--el-2)] hover:ring-1 hover:ring-blue-100/50',
      surface: 'rounded-card border border-slate-100 bg-white/95 shadow-[var(--el-1)] backdrop-blur-sm hover:shadow-[var(--el-2)] hover:ring-1 hover:ring-blue-100/50',
      metric: 'rounded-card border border-l-4 border-slate-100 border-l-blue-500 bg-white shadow-[var(--el-1)] hover:shadow-[var(--el-2)] hover:ring-1 hover:ring-blue-100/50',
      detail: 'rounded-card border border-slate-100 bg-white shadow-[var(--el-2)] hover:shadow-[var(--el-3)] hover:ring-1 hover:ring-blue-100/50',
      ghost: 'rounded-card border border-dashed border-slate-200 bg-slate-50/80 shadow-none hover:shadow-[var(--el-1)] hover:ring-1 hover:ring-blue-100/40',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-slate-500', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
