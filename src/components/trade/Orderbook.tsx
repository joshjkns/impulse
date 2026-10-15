import { ArrowLeftRight, ChevronDown, GripVertical } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { LogoPulse } from '@/components/brand/Logo'
import { CoinIcon } from '@/components/common'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fmtPx } from '@/lib/format'
import { subs } from '@/lib/hl'
import { cn } from '@/lib/utils'
import { useMarket } from '@/store/markets'

export interface Level {
  px: number
  sz: number
}

/** Live L2 book over websocket, aggregated server-side to `nSigFigs`. */
export function useBook(coin: string, nSigFigs?: number) {
  const [book, setBook] = useState<{ bids: Level[]; asks: Level[] } | null>(null)
  useEffect(() => {
    let alive = true
    let unsub: (() => void) | undefined
    setBook(null)
    subs
      .l2Book({ coin, ...(nSigFigs && nSigFigs < 5 ? { nSigFigs: nSigFigs as 2 | 3 | 4 } : {}) }, (b) => {
        if (!alive) return
        const map = (ls: { px: string; sz: string }[]) => ls.map((l) => ({ px: +l.px, sz: +l.sz }))
        setBook({ bids: map(b.levels[0]), asks: map(b.levels[1]) })
      })
      .then((s) => (alive ? (unsub = () => void s.unsubscribe()) : void s.unsubscribe()))
      .catch(() => undefined)
    return () => {
      alive = false
      unsub?.()
    }
  }, [coin, nSigFigs])
  return book
}

export interface Trade {
  px: number
  sz: number
  side: 'B' | 'A'
  time: number
  tid: number
}

export function useTrades(coin: string) {
  const [trades, setTrades] = useState<Trade[]>([])
  useEffect(() => {
    let alive = true
    let unsub: (() => void) | undefined
    setTrades([])
    subs
      .trades({ coin }, (ts) => {
        if (!alive) return
        setTrades((prev) => [...ts.map((t) => ({ px: +t.px, sz: +t.sz, side: t.side, time: t.time, tid: t.tid })).reverse(), ...prev].slice(0, 80))
      })
      .then((s) => (alive ? (unsub = () => void s.unsubscribe()) : void s.unsubscribe()))
      .catch(() => undefined)
    return () => {
      alive = false
      unsub?.()
    }
  }, [coin])
  return trades
}

const ROWS = 12

export function Orderbook({ coin, className }: { coin: string; className?: string }) {
  const m = useMarket(coin)
  const [tab, setTab] = useState<'book' | 'trades'>('book')
  const [sig, setSig] = useState(5)
  const [usd, setUsd] = useState(false)
  const book = useBook(coin, sig)
  const trades = useTrades(coin)
  const mag = m?.markPx ? Math.floor(Math.log10(m.markPx)) + 1 : 1
  const tick = (n: number) => 10 ** (mag - n)
  const tickLabel = (n: number) => {
    const t = tick(n)
    return t >= 1 ? String(t) : t.toFixed(Math.max(0, -Math.floor(Math.log10(t))))
  }
  const dec = Math.max(0, -Math.floor(Math.log10(tick(sig))))

  const view = useMemo(() => {
    if (!book) return null
    const cum = (ls: Level[]) => {
      let t = 0
      return ls.slice(0, ROWS).map((l) => ((t += usd ? l.px * l.sz : l.sz), { ...l, total: t }))
    }
    const bids = cum(book.bids)
    const asks = cum(book.asks)
    const max = Math.max(bids[bids.length - 1]?.total ?? 0, asks[asks.length - 1]?.total ?? 0)
    const spread = asks[0] && bids[0] ? asks[0].px - bids[0].px : 0
    const bidSum = bids[bids.length - 1]?.total ?? 0
    const askSum = asks[asks.length - 1]?.total ?? 0
    return { bids, asks: asks.reverse(), max, spread, spreadPct: bids[0] ? (spread / bids[0].px) * 100 : 0, bidPct: (bidSum / Math.max(1e-9, bidSum + askSum)) * 100 }
  }, [book, usd])

  const unit = usd ? 'USD' : (m?.symbol ?? '')
  const fmtSz = (v: number) => (usd ? Math.round(v).toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: m?.szDecimals ?? 3, minimumFractionDigits: m?.szDecimals ?? 3 }))

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex h-10 shrink-0 items-center gap-1 px-2 text-[12.5px]">
        <GripVertical className="size-3.5 text-fg-3" />
        <CoinIcon coin={coin} className="size-3.5 rounded-full" />
        <ChevronDown className="size-3 text-fg-3" />
        <div className="ml-auto flex items-center">
          {(['book', 'trades'] as const).map((t, i) => (
            <div key={t} className="flex items-center">
              {i > 0 && <span className="mx-1 h-3 w-px bg-white/10" />}
              <button onClick={() => setTab(t)} className={cn('px-3 py-1 transition-colors', tab === t ? 'text-fg' : 'text-fg-2 hover:text-fg')}>
                {t === 'book' ? 'Orderbook' : 'Trades'}
              </button>
            </div>
          ))}
        </div>
        <span className="flex-1" />
      </div>

      {tab === 'book' ? (
        <>
          <div className="flex items-center justify-between px-2 pb-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-6 items-center gap-1 rounded-md bg-raised px-2 text-[11.5px] text-fg hover:bg-hover">
                  {tickLabel(sig)} <ChevronDown className="size-3 text-fg-2" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {[5, 4, 3, 2].map((n) => (
                  <DropdownMenuItem key={n} onSelect={() => setSig(n)}>
                    {tickLabel(n)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button onClick={() => setUsd(!usd)} className="flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] text-fg hover:bg-hover">
              <ArrowLeftRight className="size-3 text-fg-2" /> {usd ? 'USD' : m?.symbol}
            </button>
          </div>
          <div className="grid grid-cols-3 px-2 pb-1 text-[11px] text-fg-2">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total ({unit})</span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence>
              {!view && (
                <motion.div exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center">
                  <LogoPulse className="size-6" />
                </motion.div>
              )}
            </AnimatePresence>
            {view && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex h-full flex-col">
                <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
                  {view.asks.map((l) => (
                    <BookRow key={`a${l.px}`} l={l} max={view.max} side="ask" dec={dec} fmtSz={fmtSz} usd={usd} />
                  ))}
                </div>
                <div className="grid grid-cols-3 bg-raised/60 px-2 py-[5px] text-[11.5px] text-fg">
                  <span className="text-center">Spread</span>
                  <span className="num text-right">{view.spread.toFixed(dec)}</span>
                  <span className="num text-right">{view.spreadPct.toFixed(3)}%</span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {view.bids.map((l) => (
                    <BookRow key={`b${l.px}`} l={l} max={view.max} side="bid" dec={dec} fmtSz={fmtSz} usd={usd} />
                  ))}
                </div>
                <div className="m-2 mt-1 flex h-[20px] shrink-0 overflow-hidden rounded-[5px] text-[11px]">
                  <motion.div
                    className="flex items-center bg-up-soft pl-2 text-up"
                    animate={{ width: `${view.bidPct}%` }}
                    transition={{ duration: 0.3, ease: [0.2, 0.9, 0.1, 1] }}
                  >
                    <span className="num">{view.bidPct.toFixed(0)}%</span>
                  </motion.div>
                  <div className="flex flex-1 items-center justify-end bg-down-soft pr-2 text-down">
                    <span className="num">{(100 - view.bidPct).toFixed(0)}%</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 no-scrollbar">
          <div className="sticky top-0 grid grid-cols-3 bg-panel pb-1 text-[11px] text-fg-2">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Time</span>
          </div>
          {trades.map((t) => (
            <motion.div
              key={t.tid}
              initial={{ backgroundColor: t.side === 'B' ? 'rgba(47,196,99,0.18)' : 'rgba(240,64,90,0.18)' }}
              animate={{ backgroundColor: 'rgba(0,0,0,0)' }}
              transition={{ duration: 0.6 }}
              className="num grid grid-cols-3 py-[3px] text-[11.5px]"
            >
              <span className={t.side === 'B' ? 'text-up' : 'text-down'}>{fmtPx(t.px)}</span>
              <span className="text-right text-fg">{t.sz}</span>
              <span className="text-right text-fg-2">{new Date(t.time).toLocaleTimeString('en-US', { hour12: false })}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function BookRow({
  l,
  max,
  side,
  dec,
  fmtSz,
  usd,
}: {
  l: Level & { total: number }
  max: number
  side: 'bid' | 'ask'
  dec: number
  fmtSz: (v: number) => string
  usd: boolean
}) {
  return (
    <div className="num relative grid h-[16.8px] grid-cols-3 items-center px-2 text-[11.5px]">
      <div
        className={cn('absolute inset-y-[1px] left-0 transition-[width] duration-300 ease-out', side === 'bid' ? 'bg-up/[0.13]' : 'bg-down/[0.15]')}
        style={{ width: `${(l.total / Math.max(1e-9, max)) * 100}%` }}
      />
      <span className={cn('relative', side === 'bid' ? 'text-up' : 'text-down')}>{l.px.toFixed(dec)}</span>
      <span className="relative text-right text-fg">{fmtSz(usd ? l.px * l.sz : l.sz)}</span>
      <span className="relative text-right text-fg">{fmtSz(l.total)}</span>
    </div>
  )
}
