import { Expand, GripVertical, Pencil, RefreshCw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LogoPulse } from '@/components/brand/Logo'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useWorkspaces, type Widget } from '@/store/workspaces'
import { WIDGETS } from './registry'

/** Minimum time the "drawing" placeholder stays up so the reveal reads as deliberate. */
const MIN_DRAW_MS = 900

export function WidgetFrame({ tabId, widget }: { tabId: string; widget: Widget }) {
  const update = useWorkspaces((s) => s.updateWidget)
  const remove = useWorkspaces((s) => s.removeWidget)
  const [nonce, setNonce] = useState(0)
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const mountedAt = useRef(Date.now())
  const drawing = widget.status === 'drawing'
  const Body = WIDGETS[widget.kind]

  const onReady = useCallback(() => {
    if (widget.status !== 'drawing') return
    const wait = Math.max(0, MIN_DRAW_MS - (Date.now() - mountedAt.current))
    setTimeout(() => update(tabId, widget.id, { status: 'ready' }), wait)
  }, [tabId, widget.id, widget.status, update])

  // Safety net: never leave a widget stuck drawing.
  useEffect(() => {
    if (!drawing) return
    const t = setTimeout(() => update(tabId, widget.id, { status: 'ready' }), 12_000)
    return () => clearTimeout(t)
  }, [drawing, tabId, widget.id, update])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.9, 0.1, 1] }}
      className="group flex h-full flex-col overflow-hidden rounded-[12px] bg-panel"
    >
      <header className="drag-handle flex shrink-0 cursor-grab items-start gap-1.5 px-2 pt-2.5 pb-1 active:cursor-grabbing">
        <span title="Drag to move" className="-mt-0.5 grid h-6 w-4 shrink-0 place-items-center rounded-[6px] text-fg-3 transition-colors group-hover:text-fg-2 hover:bg-hover hover:text-fg">
          <GripVertical className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              defaultValue={widget.title}
              onBlur={(e) => (update(tabId, widget.id, { title: e.target.value || widget.title }), setEditing(false))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="no-drag w-full cursor-text rounded bg-field px-1 text-[13px] text-fg outline-none ring-1 ring-line"
            />
          ) : (
            <h3 className="truncate text-[13px] text-fg" onDoubleClick={() => !drawing && setEditing(true)}>{drawing ? widget.subtitle.replace(/\.$/, '') : widget.title}</h3>
          )}
          <p className="truncate text-[11px] text-fg-2">{drawing ? 'Impulse is drawing it from live market data.' : widget.subtitle}</p>
        </div>
        <div className="no-drag flex shrink-0 cursor-default items-center gap-0.5 text-fg-2">
          {!drawing && (
            <>
              <Action onClick={() => setEditing(true)} label="Rename">
                <Pencil className="size-3.5" />
              </Action>
              <Action onClick={() => setNonce((n) => n + 1)} label="Refresh">
                <RefreshCw className="size-3.5" />
              </Action>
            </>
          )}
          <Action onClick={() => setExpanded(true)} label="Expand">
            <Expand className="size-3.5" />
          </Action>
          <Action onClick={() => remove(tabId, widget.id)} label="Remove" className="hidden group-hover:grid">
            <X className="size-3.5" />
          </Action>
        </div>
      </header>
      <div className="widget-body relative min-h-0 flex-1">
        <AnimatePresence>
          {drawing && (
            <motion.div key="drawing" exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18 }} className="absolute inset-0 z-10 grid place-items-center bg-panel">
              <LogoPulse className="size-7" />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          key={nonce}
          className="absolute inset-0"
          initial={false}
          animate={drawing ? { opacity: 0, filter: 'blur(6px)' } : { opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.35, ease: [0.2, 0.9, 0.1, 1] }}
        >
          {Body && <Body coin={widget.coin} widget={widget} onReady={onReady} />}
        </motion.div>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[82vh] w-[90vw] max-w-[1200px] flex-col gap-2 p-3 sm:max-w-[1200px]">
          <DialogTitle className="px-1 text-[14px] font-normal">{widget.title}</DialogTitle>
          <div className="relative min-h-0 flex-1">{Body && <Body coin={widget.coin} widget={widget} onReady={() => undefined} />}</div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

function Action({ children, onClick, label, className }: { children: React.ReactNode; onClick: () => void; label: string; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn('grid size-7 place-items-center rounded-lg transition-colors hover:bg-hover hover:text-fg', className)}>
      {children}
    </button>
  )
}

/** Small "👁 CL" legend chip shown on top of chart widgets. */
export function LegendChip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-[5px] bg-white/[0.05] px-1.5 py-[2px] text-[10.5px] text-fg">
      {color && <span className="size-2 rounded-[2px]" style={{ background: color }} />}
      {children}
    </span>
  )
}
