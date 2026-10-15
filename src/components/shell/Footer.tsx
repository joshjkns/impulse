import { ChevronDown, ChevronUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtPct, fmtPx, fmtSigned, sigDecimals, tone } from '@/lib/format'
import { useMarkets } from '@/store/markets'
import { usePrefs } from '@/store/prefs'

const PER_PAGE = 2

/** Bottom status bar: disclaimers + a paged ticker of favorites (chevrons flip pages vertically). */
export function Footer() {
  const favorites = usePrefs((s) => s.favorites)
  const markets = useMarkets((s) => s.markets)
  const items = favorites.map((c) => markets[c]).filter(Boolean)
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE))
  const [[page, dir], setPage] = useState<[number, number]>([0, 1])
  const [disclaimer, setDisclaimer] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setPage(([p]) => [(p + 1) % pages, 1]), 8000)
    return () => clearInterval(t)
  }, [pages])

  const visible = items.slice((page % pages) * PER_PAGE, (page % pages) * PER_PAGE + PER_PAGE)

  return (
    <footer className="flex h-9 shrink-0 items-center gap-4 pr-3 pl-4 text-[12px]">
      <button onClick={() => setDisclaimer(true)} className="text-fg-2 transition-colors hover:text-fg">
        Disclaimers
      </button>
      <span className="h-3.5 w-px bg-line" />
      <div className="relative ml-auto h-5 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={page}
            custom={dir}
            variants={{
              enter: (d: number) => ({ y: d * 14, opacity: 0, filter: 'blur(3px)' }),
              center: { y: 0, opacity: 1, filter: 'blur(0px)' },
              exit: (d: number) => ({ y: d * -14, opacity: 0, filter: 'blur(3px)' }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.2, 0.9, 0.1, 1] }}
            className="absolute inset-0 flex items-center justify-end gap-5"
          >
            {visible.map((m) => (
              <span key={m.coin} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-fg">{m.name}</span>
                <span className="num text-fg">{fmtPx(m.markPx)}</span>
                <span className={`num ${tone(m.change)}`}>
                  {fmtSigned(m.change, sigDecimals(m.markPx))} ({fmtPct(m.changePct, 2, false)})
                </span>
              </span>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1 text-fg-2">
        <button className="grid size-6 place-items-center rounded-md hover:bg-hover hover:text-fg" onClick={() => setPage(([p]) => [(p - 1 + pages) % pages, -1])}>
          <ChevronUp className="size-3.5" />
        </button>
        <button className="grid size-6 place-items-center rounded-md hover:bg-hover hover:text-fg" onClick={() => setPage(([p]) => [(p + 1) % pages, 1])}>
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      <Dialog open={disclaimer} onOpenChange={setDisclaimer}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disclaimers</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-[13px] leading-relaxed text-fg-2">
                <p>
                  Impulse is a non-custodial interface to Hyperliquid. Orders are signed in your browser by a trading key that only
                  your wallet can approve, and are executed on-chain by Hyperliquid. Impulse never holds your funds.
                </p>
                <p>
                  Perpetual futures are leveraged and can lose more than your margin through liquidation. Equity, index and
                  commodity markets are HIP-3 perpetuals that track an oracle price and are not the underlying asset.
                </p>
                <p>
                  AI output comes from the coding agent you run locally and can be wrong. Nothing here is financial advice.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </footer>
  )
}
