import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white shadow-sm hover:bg-blue-500",
        destructive:
          "bg-rose-600 text-white shadow-sm hover:bg-rose-500",
        outline:
          "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
        secondary:
          "bg-slate-100 text-slate-700 hover:bg-slate-200",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        link: "rounded-none px-0 text-blue-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  className?: string
}

type ButtonNativeProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonBaseProps & {
    asChild?: false
    loading?: boolean
  }

type ButtonAsChildProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonBaseProps & {
    asChild: true
    loading?: never
  }

export type ButtonProps = ButtonNativeProps | ButtonAsChildProps

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    const {
      className,
      variant,
      size,
      asChild = false,
      loading: loadingProp,
      disabled,
      children,
      onClick,
      style,
      ...rest
    } = props
    const Comp = asChild ? Slot : "button"
    const loading = asChild ? false : loadingProp || false
    const isDisabled = disabled || loading
    const content = loading ? (
      <>
        <span className="opacity-0">{children}</span>
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        </span>
      </>
    ) : (
      children
    )

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (isDisabled) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      onClick?.(event)
    }

    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          aria-busy={loading || undefined}
          aria-disabled={isDisabled || undefined}
          data-disabled={isDisabled ? "" : undefined}
          data-loading={loading ? "" : undefined}
          onClickCapture={handleClick}
          style={{
            ...style,
            pointerEvents: isDisabled ? "none" : style?.pointerEvents,
          }}
          ref={ref}
          tabIndex={isDisabled ? -1 : rest.tabIndex}
          {...rest}
        >
          {children}
        </Comp>
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), loading && "relative")}
        aria-busy={loading || undefined}
        disabled={isDisabled}
        onClick={handleClick}
        ref={ref}
        style={style}
        {...rest}
      >
        <span className="inline-flex items-center justify-center gap-2">{content}</span>
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
