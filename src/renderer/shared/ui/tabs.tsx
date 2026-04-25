import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@shared/lib/utils'

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-1 backdrop-blur-sm',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
      'text-white/45 transition-all duration-150',
      'hover:text-white/85 hover:bg-white/[0.05]',
      'data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30',
      'disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('focus-visible:outline-none animate-fade-in', className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName
