import * as React from 'react'
import { cn } from '@shared/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md bg-white/[0.04] px-3 py-1 text-sm text-white placeholder:text-white/30',
        'border border-white/[0.08] outline-none transition-all',
        'focus:border-[rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.50)] focus:bg-white/[0.07] focus:ring-2 focus:ring-[rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.15)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
