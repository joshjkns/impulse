import { Plus, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useChat } from '@/store/chat'
import { FEATURED_SCANS, usePrefs, type Scan } from '@/store/prefs'

export function ScansSidebar() {
  const { scans, activeScan, set, removeScan } = usePrefs()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const send = useChat((s) => s.send)

  const submit = () => {
    if (!q.trim()) return
    void send(`Create a market scan called something short for: ${q.trim()}. Use the create_scan tool.`, { surface: 'modal' })
    setQ('')
    setOpen(false)
  }

  return (
    <div className="flex w-[166px] shrink-0 flex-col overflow-y-auto px-2 pt-3 no-scrollbar">
      <h2 className="px-2 text-[13px] font-medium text-fg">Market Scans</h2>
      <Label>Yours</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-2 py-[7px] text-[12.5px] text-brand transition-colors hover:bg-hover/60">
            <span className="grid size-[15px] place-items-center rounded-full bg-brand text-white">
              <Plus className="size-2.5" strokeWidth={3} />
            </span>
            Create your own
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-72 rounded-xl border-line bg-popover p-2">
          <p className="px-1 pb-2 text-[12px] text-fg-2">Describe the markets you want. Impulse builds the filter.</p>
          <textarea
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())}
            placeholder="e.g. Korean memory names up today"
            className="h-20 w-full resize-none rounded-lg bg-field p-2 text-[12.5px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
          />
          <button onClick={submit} className="mt-2 w-full rounded-lg bg-fg py-1.5 text-[12.5px] font-medium text-[#111113] active:scale-[0.99]">
            Create scan
          </button>
        </PopoverContent>
      </Popover>
      {scans.map((s) => (
        <Item key={s.id} scan={s} active={activeScan === s.id} onClick={() => set({ activeScan: s.id })} onRemove={() => removeScan(s.id)} />
      ))}
      <Label>Featured</Label>
      {FEATURED_SCANS.map((s) => (
        <Item key={s.id} scan={s} active={activeScan === s.id} onClick={() => set({ activeScan: s.id })} />
      ))}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 mb-1 px-2 text-[11px] text-fg-3">{children}</div>
}

function Item({ scan, active, onClick, onRemove }: { scan: Scan; active: boolean; onClick: () => void; onRemove?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center rounded-lg px-2 py-[8px] text-left text-[12.5px] transition-colors duration-150',
        active ? 'text-fg' : 'text-fg hover:bg-hover/50',
      )}
    >
      {active && (
        <motion.span layoutId="scan-active" className="absolute inset-0 rounded-lg bg-hover" transition={{ type: 'spring', stiffness: 800, damping: 50 }} />
      )}
      <span className="relative truncate">{scan.name}</span>
      {onRemove && (
        <span
          role="button"
          onClick={(e) => (e.stopPropagation(), onRemove())}
          className="relative ml-auto hidden size-4 place-items-center rounded text-fg-3 group-hover:grid hover:text-fg"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  )
}
