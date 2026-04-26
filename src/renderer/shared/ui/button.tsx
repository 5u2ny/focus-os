import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@shared/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-white/[0.06] text-white/85 border border-white/[0.10] hover:bg-white/[0.12] hover:text-white hover:border-white/20',
        phase:   'phase-bg-soft phase-text phase-border border hover:bg-[rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.22)] hover:phase-glow',
        ghost:   'text-white/60 hover:bg-white/[0.06] hover:text-white',
        icon:    'text-white/45 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20',
        // Apple Liquid Glass button styles (per HIG glass / glassProminent):
        // .glass = subtle translucent tint with bright top rim — secondary actions
        glass:   'text-white/90 border border-white/[0.18] bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.30)] backdrop-blur-md hover:bg-white/[0.12] hover:border-white/30',
        // .glassProminent = phase-tinted version, more saturated — primary CTA on a glass surface
        glassProminent: 'phase-text border phase-border bg-[rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.18)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_18px_rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.20)] backdrop-blur-md hover:bg-[rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.28)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_0_28px_rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.40)]',
      },
      size: {
        default: 'h-8 px-3',
        sm:      'h-7 px-2.5 text-xs',
        lg:      'h-10 px-5 text-sm',
        icon:    'h-8 w-8',
        iconSm:  'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
)
Button.displayName = 'Button'
