import { GripVertical } from 'lucide-react'
import { createContext, useContext } from 'react'
import { cn } from '@/lib/utils'

/** Provided by a movable pane (see `TradeLayout`); starts dragging that pane. */
export const PaneDragContext = createContext<((e: React.PointerEvent) => void) | null>(null)

/** The ⠿ handle in a pane header. Renders nothing when the pane can't be moved (e.g. inside a widget). */
export function PaneGrip({ className }: { className?: string }) {
  const start = useContext(PaneDragContext)
  if (!start) return null
  return (
    <span
      onPointerDown={start}
      title="Drag to move"
      className={cn(
        'grid h-7 w-4 shrink-0 cursor-grab touch-none place-items-center rounded-[6px] text-fg-3 transition-colors hover:bg-hover hover:text-fg active:cursor-grabbing',
        className,
      )}
    >
      <GripVertical className="size-3.5" />
    </span>
  )
}
