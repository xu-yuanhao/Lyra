import * as React from "react"
import { cn } from "@renderer/ui/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(className)}
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Indicator>) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn(className)}
      {...props}
    />
  )
}

export { Progress, ProgressIndicator }
