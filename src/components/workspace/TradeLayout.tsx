import { ArrowLeftRight, GripVertical } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AccountSummary } from '@/components/trade/AccountSummary'
import { ChartPanel } from '@/components/trade/ChartPanel'
import { OrderTicket } from '@/components/trade/OrderTicket'
import { Orderbook } from '@/components/trade/Orderbook'
import { PaneDragContext } from '@/components/trade/PaneGrip'
import { PositionsTabs } from '@/components/trade/PositionsTabs'
import { useOpenMarket } from '@/components/shell/PortfolioPanel'
import { cn } from '@/lib/utils'
import type { Tab } from '@/store/workspaces'

const EASE = [0.2, 0.9, 0.1, 1] as const
const panel = 'h-full rounded-[12px] bg-panel'

/* ------------------------------------------------------------------ movable panes */

type Pane = 'chart' | 'book' | 'positions' | 'ticket'
const DEFAULT_SLOTS: Record<Pane, Pane> = { chart: 'chart', book: 'book', positions: 'positions', ticket: 'ticket' }
const LABEL: Record<Pane, string> = { chart: 'Chart', book: 'Order book', positions: 'Positions', ticket: 'Order ticket' }
const BODY_CLASS: Record<Pane, string> = {
  chart: 'overflow-hidden',
  book: 'flex overflow-hidden',
  positions: 'overflow-hidden',
  ticket: 'flex flex-col justify-between overflow-y-auto no-scrollbar',
}

/** Which pane sits in which slot. Shared by every market tab, like the split sizes. */
export const useTradeSlots = create<{ slots: Record<Pane, Pane>; swap: (a: Pane, b: Pane) => void; reset: () => void }>()(
  persist(
    (set, get) => ({
      slots: DEFAULT_SLOTS,
      swap: (a, b) => {
        const s = get().slots
        set({ slots: { ...s, [a]: s[b], [b]: s[a] } })
      },
      reset: () => set({ slots: DEFAULT_SLOTS }),
    }),
    { name: 'impulse.trade.slots' },
  ),
)

interface Drag {
  from: Pane
  x: number
  y: number
  over?: Pane
}

/** Press a pane's grip and drag it onto another slot to trade places. */
function usePaneDrag(root: React.RefObject<HTMLElement | null>) {
  const swap = useTradeSlots((s) => s.swap)
  const [drag, setDrag] = useState<Drag | null>(null)
  const cleanup = useRef<() => void>(undefined)
  useEffect(() => () => cleanup.current?.(), [])

  const start = useCallback(
    (from: Pane) => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      const x0 = e.clientX
      const y0 = e.clientY
      let cur: Drag | null = null
      let frame = 0
      const slotAt = (x: number, y: number) => {
        for (const el of root.current?.querySelectorAll<HTMLElement>('[data-slot]') ?? []) {
          const r = el.getBoundingClientRect()
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.slot as Pane
        }
      }
      const move = (ev: PointerEvent) => {
        if (!cur && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return
        cur = { from, x: ev.clientX, y: ev.clientY, over: slotAt(ev.clientX, ev.clientY) }
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => setDrag(cur))
      }
      const end = (commit: boolean) => {
        cleanup.current?.()
        if (commit && cur?.over && cur.over !== from) swap(from, cur.over)
        setDrag(null)
      }
      const up = () => end(true)
      const key = (ev: KeyboardEvent) => ev.key === 'Escape' && end(false)
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      window.addEventListener('keydown', key)
      cleanup.current = () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.removeEventListener('keydown', key)
        cleanup.current = undefined
      }
    },
    [root, swap],
  )
  return { drag, start }
}

/* ------------------------------------------------------------------ layout */

/*
 * Pane bodies are memoised: TradeLayout re-renders on every pointer move while a pane is dragged, and the
 * chart, book, ticket and positions shouldn't re-render with it.
 */
const ChartPane = memo(ChartPanel)
const BookPane = memo(Orderbook)
const PositionsPane = memo(PositionsTabs)
const TicketPane = memo(function TicketPane({ coin, onCoinChange }: { coin: string; onCoinChange: (c: string) => void }) {
  return (
    <>
      <OrderTicket coin={coin} onCoinChange={onCoinChange} />
      <AccountSummary />
    </>
  )
})

/** Splits are shared by every market tab, so a layout you like follows you between markets. */
const useSaved = (id: string) => useDefaultLayout({ id: `impulse.trade.${id}`, onlySaveAfterUserInteractions: true })

/** Standard market workspace: chart · order book · ticket, positions underneath. Every split is draggable, every pane movable. */
export function TradeLayout({ tab }: { tab: Extract<Tab, { kind: 'market' }> }) {
  const openMarket = useOpenMarket()
  const openRef = useRef(openMarket)
  useEffect(() => {
    openRef.current = openMarket
  })
  const onCoinChange = useCallback((c: string) => openRef.current(c), [])
  const slots = useTradeSlots((s) => s.slots)
  const root = useRef<HTMLDivElement>(null)
  const { drag, start } = usePaneDrag(root)
  const outer = useSaved('outer')
  const main = useSaved('main')
  const top = useSaved('top')

  const body = (pane: Pane) => {
    switch (pane) {
      case 'chart':
        return <ChartPane coin={tab.coin} />
      case 'book':
        return <BookPane coin={tab.coin} className="flex-1" />
      case 'positions':
        return <PositionsPane className="h-full" />
      case 'ticket':
        return <TicketPane coin={tab.coin} onCoinChange={onCoinChange} />
    }
  }

  const slot = (id: Pane, i: number) => {
    const pane = slots[id]
    const isTarget = !!drag && drag.over === id && drag.from !== id
    const isSource = !!drag && drag.from === id
    // Each overlay names the pane that will land in that slot on drop.
    const incoming = isTarget ? slots[drag.from] : isSource && drag.over && drag.over !== id ? slots[drag.over] : undefined
    return (
      <div data-slot={id} className="relative h-full">
        <PaneDragContext.Provider value={start(id)}>
          <motion.div
            key={pane}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: isSource ? 0.35 : 1, y: 0, scale: isSource ? 0.985 : 1 }}
            transition={{ duration: 0.22, delay: drag ? 0 : i * 0.03, ease: EASE }}
            className={cn(panel, BODY_CLASS[pane])}
          >
            {body(pane)}
          </motion.div>
        </PaneDragContext.Provider>
        <AnimatePresence>
          {(isTarget || isSource) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className={cn(
                'pointer-events-none absolute inset-0 grid place-items-center rounded-[12px] border-[1.5px]',
                isTarget ? 'border-brand/70 bg-brand/[0.07]' : 'border-dashed border-white/15',
              )}
            >
              {incoming && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.16, ease: EASE }}
                  className="flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5 text-[12px] text-fg shadow-lg ring-1 ring-white/10"
                >
                  <ArrowLeftRight className="size-3.5 text-brand" /> {LABEL[incoming]}
                </motion.span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div ref={root} className={cn('h-full', drag && 'pane-dragging')}>
      <Group orientation="horizontal" className="h-full" {...outer}>
        <Panel id="main" minSize="40%">
          <Group orientation="vertical" {...main}>
            <Panel id="top" minSize="30%">
              <Group orientation="horizontal" {...top}>
                <Panel id="chart" minSize="35%">
                  {slot('chart', 0)}
                </Panel>
                <Split />
                <Panel id="book" defaultSize={272} minSize={210} maxSize={460}>
                  {slot('book', 1)}
                </Panel>
              </Group>
            </Panel>
            <Split vertical />
            <Panel id="positions" defaultSize={140} minSize={92} maxSize="60%">
              {slot('positions', 2)}
            </Panel>
          </Group>
        </Panel>
        <Split />
        <Panel id="ticket" defaultSize={272} minSize={248} maxSize={380}>
          {slot('ticket', 3)}
        </Panel>
      </Group>
      <AnimatePresence>
        {drag && (
          <motion.div
            key="ghost"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.14, ease: EASE }}
            className="pointer-events-none fixed z-50 flex items-center gap-1.5 rounded-[10px] bg-raised py-2 pr-3.5 pl-2 text-[12.5px] text-fg shadow-[0_18px_48px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/10"
            style={{ left: drag.x + 10, top: drag.y + 10 }}
          >
            <GripVertical className="size-3.5 text-fg-3" />
            {LABEL[slots[drag.from]]}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** 8px gutter that doubles as the drag target; a hairline appears on hover or while dragging. */
function Split({ vertical }: { vertical?: boolean }) {
  return (
    <Separator
      className={cn(
        'group relative shrink-0 outline-none',
        vertical ? 'h-2 cursor-row-resize' : 'w-2 cursor-col-resize',
      )}
    >
      <span
        className={cn(
          'absolute rounded-full bg-[#5a5a64] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[separator=active]:opacity-100',
          vertical ? 'inset-x-[calc(50%-14px)] top-[3px] h-[2px]' : 'inset-y-[calc(50%-14px)] left-[3px] w-[2px]',
        )}
      />
    </Separator>
  )
}
