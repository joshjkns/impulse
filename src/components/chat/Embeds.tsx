import { Maximize2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { CoinIcon, LivePrice } from '@/components/common'
import { useOpenMarket } from '@/components/shell/PortfolioPanel'
import { fmtPct, tone } from '@/lib/format'
import type { CandleInterval } from '@/lib/hl'
import { cn } from '@/lib/utils'
import { resolveCoin, useMarketMeta, useMarketValue } from '@/store/markets'
import { WIDGET_KINDS, WIDGET_META, type Widget, type WidgetKind } from '@/store/workspaces'

/*
 * Live components an agent can put in a reply by writing a token in its text:
 *   [[ticker:BTC]] or [[ticker:BTC,ETH,xyz:CL]]   inline price chips
 *   [[chart:BTC]] or [[chart:xyz:CL:4h]]           candle chart card (interval 1m|5m|15m|1h|4h|1d, default 1h)
 *   [[widget:funding:BTC]]                         any workspace widget kind as a card
 * Tokens live in the message text, so they persist with the chat and work for every harness.
 */

const INTERVALS = new Set<CandleInterval>(['1m', '5m', '15m', '1h', '4h', '1d'])
const BARS: Record<CandleInterval, number> = { '1m': 120, '5m': 144, '15m': 96, '1h': 168, '4h': 180, '1d': 365 }

/** Block-level embeds (charts, widgets) as opposed to inline ticker chips. */
export const BLOCK_EMBED = /\[\[(?:chart|widget):[^\]\n]+\]\]/g
/** Every embed token, for splitting inline text. */
export const EMBED = /\[\[(?:ticker|chart|widget):[^\]\n]+\]\]/

/** Charts and widget bodies are code-split with the workspace grid; they load the first time one is shown. */
const CandleChart = lazy(() => import('@/components/charts/CandleChart').then((m) => ({ default: m.CandleChart })))
const WidgetBody = lazy(() =>
  import('@/components/widgets/registry').then((m) => ({
    default: ({ widget }: { widget: Widget }) => {
      const Body = m.WIDGETS[widget.kind]
      return <Body coin={widget.coin} widget={widget} onReady={noop} />
    },
  })),
)
const noop = () => undefined

/** Renders one embed token; unknown markets or kinds fall back to the raw text. */
export function Embed({ token }: { token: string }) {
  const [kind, ...rest] = token.slice(2, -2).split(':')
  const arg = rest.join(':').trim()
  if (kind === 'ticker') {
    const coins = arg.split(/[,\s]+/).map((c) => resolveCoin(c)).filter((c): c is string => !!c)
    if (!coins.length) return <>{token}</>
    return (
      <>
        {coins.map((c) => (
          <TickerChip key={c} coin={c} />
        ))}
      </>
    )
  }
  if (kind === 'chart') {
    const parts = arg.split(':')
    const last = parts[parts.length - 1] as CandleInterval
    const interval = parts.length > 1 && INTERVALS.has(last) ? last : '1h'
    const coin = resolveCoin(INTERVALS.has(last) && parts.length > 1 ? parts.slice(0, -1).join(':') : arg)
    if (!coin) return <span className="text-fg-3">{token}</span>
    return (
      <Card coin={coin} label={interval}>
        <Suspense fallback={null}>
          <CandleChart coin={coin} interval={interval} bars={BARS[interval]} live />
        </Suspense>
      </Card>
    )
  }
  if (kind === 'widget') {
    const [wk, ...c] = arg.split(':')
    const wkind = wk as WidgetKind
    const coin = resolveCoin(c.join(':')) ?? (wkind === 'positions' ? '' : undefined)
    if (!WIDGET_KINDS.includes(wkind) || wkind === 'note' || coin == null) return <span className="text-fg-3">{token}</span>
    const sym = coin.replace(/^xyz:/, '')
    const widget: Widget = { id: `embed-${wkind}-${coin}`, kind: wkind, coin, title: WIDGET_META[wkind].title(sym), subtitle: '', status: 'ready' }
    return (
      <Card coin={coin || undefined} label={widget.title} tall={wkind === 'orderbook' || wkind === 'trades' || wkind === 'monthly_returns'}>
        <Suspense fallback={null}>
          <WidgetBody widget={widget} />
        </Suspense>
      </Card>
    )
  }
  return <>{token}</>
}

/** Inline live price chip; click to open the market. */
function TickerChip({ coin }: { coin: string }) {
  const m = useMarketMeta(coin)
  const px = useMarketValue(coin, 'markPx')
  const pct = useMarketValue(coin, 'changePct')
  const open = useOpenMarket()
  return (
    <button
      onClick={() => open(coin)}
      title={`Open ${m?.name ?? coin}`}
      className="mx-0.5 inline-flex translate-y-[2px] items-center gap-1 rounded-[7px] bg-white/[0.07] px-1.5 py-[1px] align-baseline text-[11.5px] whitespace-nowrap transition-colors hover:bg-white/[0.12]"
    >
      <CoinIcon coin={coin} className="size-3.5 rounded-[4px]" />
      <span className="text-fg">{m?.symbol ?? coin}</span>
      <LivePrice value={px ?? 0} className="text-fg" />
      <span className={cn('num', tone(pct))}>{fmtPct(pct)}</span>
    </button>
  )
}

/**
 * A chart or widget inside a reply. Mounts its body only once scrolled into view, so a long chat history
 * doesn't open a live subscription for every chart it ever showed.
 */
function Card({ coin, label, tall, children }: { coin?: string; label: string; tall?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  const open = useOpenMarket()
  const m = useMarketMeta(coin)
  const px = useMarketValue(coin, 'markPx')
  const pct = useMarketValue(coin, 'changePct')
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return (
    <div ref={ref} className="my-1 w-[440px] max-w-full overflow-hidden rounded-[12px] bg-black/25 ring-1 ring-white/[0.06]">
      <div className="flex h-8 items-center gap-1.5 px-2.5 text-[11.5px]">
        {coin && <CoinIcon coin={coin} className="size-4 rounded-[4px]" />}
        {coin && <span className="text-fg">{m?.name ?? coin}</span>}
        {coin && <LivePrice value={px ?? 0} className="text-fg" />}
        {coin && <span className={cn('num', tone(pct))}>{fmtPct(pct)}</span>}
        <span className="ml-auto truncate text-fg-3">{label}</span>
        {coin && (
          <button onClick={() => open(coin)} className="grid size-5 place-items-center rounded text-fg-3 hover:bg-white/10 hover:text-fg" title="Open market" aria-label="Open market">
            <Maximize2 className="size-3" />
          </button>
        )}
      </div>
      <div className={cn('relative', tall ? 'h-[300px]' : 'h-[200px]')}>{seen && children}</div>
    </div>
  )
}
