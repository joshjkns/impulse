import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useOpenMarket } from '@/components/shell/PortfolioPanel'
import { LivePrice, Sparkline } from '@/components/common'
import { fmtPct, fmtSigned, sigDecimals, tone } from '@/lib/format'
import { useCandles } from '@/lib/useCandles'
import { cn } from '@/lib/utils'
import { useMarket } from '@/store/markets'

const FEATURED = 'xyz:XYZ100'
const PAGES = [
  ['xyz:SP500', 'xyz:DRAM', 'BTC', 'xyz:CL', 'xyz:KR200', 'ETH', 'xyz:GOLD', 'xyz:NVDA', 'HYPE'],
  ['SOL', 'xyz:TSLA', 'xyz:SILVER', 'xyz:MU', 'xyz:JP225', 'xyz:BRENTOIL', 'xyz:SKHX', 'xyz:AAPL', 'ZEC'],
]
const DAY = 86_400_000

export function MarketStrip() {
  const [[page, dir], setPage] = useState<[number, number]>([0, 1])
  return (
    <div className="flex min-w-0 flex-1">
      <Featured coin={FEATURED} />
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={page}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 40, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -40, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.2, 0.9, 0.1, 1] }}
            className="grid h-full grid-flow-col grid-cols-3 grid-rows-3 gap-x-1 px-1 py-1.5"
          >
            {PAGES[page].map((c) => (
              <MiniTicker key={c} coin={c} />
            ))}
          </motion.div>
        </AnimatePresence>
        {page > 0 && (
          <button onClick={() => setPage([page - 1, -1])} className="absolute top-1/2 left-0 grid size-6 -translate-y-1/2 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg">
            <ChevronLeft className="size-3.5" />
          </button>
        )}
        {page < PAGES.length - 1 && (
          <button onClick={() => setPage([page + 1, 1])} className="absolute top-1/2 right-0 grid size-6 -translate-y-1/2 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg">
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Featured({ coin }: { coin: string }) {
  const m = useMarket(coin)
  const { data } = useCandles(coin, '15m', DAY, true)
  const closes = useMemo(() => data.map((d) => d.c), [data])
  const open = useOpenMarket()
  return (
    <button onClick={() => open(coin)} className="group flex w-[230px] shrink-0 flex-col px-3 pt-3 text-left">
      <span className="text-[11px] tracking-wide text-fg uppercase">{m?.name ?? 'Nasdaq 100'}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5 text-[12px]">
        <LivePrice value={m?.markPx ?? 0} className="text-fg" />
        <span className={cn('num text-[11px]', tone(m?.change))}>
          {fmtSigned(m?.change, sigDecimals(m?.markPx ?? 0))} ({fmtPct(m?.changePct, 2, false)})
        </span>
      </span>
      <Sparkline values={closes} baseline={m?.prevDayPx} up={(m?.change ?? 0) >= 0} className="mt-2 mb-3 min-h-0 w-full flex-1" />
    </button>
  )
}

function MiniTicker({ coin }: { coin: string }) {
  const m = useMarket(coin)
  const { data } = useCandles(coin, '15m', DAY, false)
  const closes = useMemo(() => data.map((d) => d.c), [data])
  const open = useOpenMarket()
  return (
    <button onClick={() => open(coin)} className="flex min-w-0 items-center gap-2 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-hover/60">
      <Sparkline values={closes} baseline={m?.prevDayPx} up={(m?.change ?? 0) >= 0} fill={false} className="h-7 w-10 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-[11px] text-fg">{m?.name ?? coin}</span>
        <span className="flex items-baseline gap-1 truncate text-[12px]">
          <LivePrice value={m?.markPx ?? 0} className="text-fg" />
          <span className={cn('num truncate text-[11px]', tone(m?.change))}>
            {fmtSigned(m?.change, sigDecimals(m?.markPx ?? 0))} ({fmtPct(m?.changePct, 2, false)})
          </span>
        </span>
      </span>
    </button>
  )
}
