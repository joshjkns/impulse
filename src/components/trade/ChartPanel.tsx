import { ArrowLeftRight, ChevronDown, Heart, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CandleChart } from '@/components/charts/CandleChart'
import { CoinIcon, LivePrice } from '@/components/common'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fmtCompact, fmtDuration, fmtPct, fmtPx, fmtSigned, sigDecimals, tone } from '@/lib/format'
import type { CandleInterval } from '@/lib/hl'
import { cn } from '@/lib/utils'
import { useMarket } from '@/store/markets'
import { usePrefs } from '@/store/prefs'
import { CoinSwitcher } from './CoinSwitcher'
import { PaneGrip } from './PaneGrip'

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d']
const RANGES: { k: string; interval: CandleInterval; bars: number }[] = [
  { k: '1H', interval: '1m', bars: 60 },
  { k: '4H', interval: '5m', bars: 48 },
  { k: '1D', interval: '15m', bars: 96 },
  { k: '3D', interval: '1h', bars: 72 },
  { k: '7D', interval: '1h', bars: 168 },
  { k: '30D', interval: '4h', bars: 180 },
  { k: 'ALL', interval: '1d', bars: 1500 },
]

function useCountdown() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return 3_600_000 - (now % 3_600_000)
}

export function ChartPanel({ coin }: { coin: string }) {
  const m = useMarket(coin)
  const { favorites, toggleFavorite } = usePrefs()
  const [interval, setIv] = useState<CandleInterval>('15m')
  const [bars, setBars] = useState(300)
  const [range, setRange] = useState<string | null>(null)
  const [volume, setVolume] = useState(true)
  const [compare, setCompare] = useState<string | undefined>()
  const [log, setLog] = useState(false)
  const [pctScale, setPctScale] = useState(false)
  const [hover, setHover] = useState<{ o: number; h: number; l: number; c: number; v: number }>()
  const countdown = useCountdown()
  const fav = favorites.includes(coin)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-5 px-2 text-[11px]">
        <span className="flex items-center gap-1">
          <PaneGrip />
          <CoinSwitcher coin={coin} className="h-8 gap-2 bg-transparent pr-2 pl-1 hover:bg-hover data-[state=open]:bg-hover">
            <CoinIcon coin={coin} className="size-[22px] rounded-full" />
            <span className="text-[14px] text-fg">{m?.symbol ?? coin}</span>
            <span className="flex items-center gap-0.5 rounded-[5px] bg-brand-soft px-1.5 py-[1px] text-[11.5px] text-brand">
              {m?.maxLeverage ?? '—'}x
            </span>
          </CoinSwitcher>
        </span>
        <Stat k="Mark" v={<LivePrice value={m?.markPx ?? 0} />} />
        <Stat k="Oracle" v={fmtPx(m?.oraclePx)} />
        <Stat
          k="Funding / Countdown"
          v={
            <span>
              <span className={tone(m?.funding)}>{fmtPct((m?.funding ?? 0) * 100, 4)}</span>
              <span className="text-fg"> / {fmtDuration(countdown)}</span>
            </span>
          }
        />
        <Stat k="24h Volume" v={fmtCompact(m?.dayNtlVlm)} className="max-xl:hidden" />
        <Stat k="Open Interest" v={fmtCompact(m?.openInterest)} className="max-xl:hidden" />
        <Stat
          k="24h Change"
          v={
            <span className={tone(m?.change)}>
              {fmtSigned(m?.change, sigDecimals(m?.markPx ?? 0))} / {fmtPct(m?.changePct)}
            </span>
          }
          className="max-lg:hidden"
        />
        <button onClick={() => toggleFavorite(coin)} className="ml-auto pr-2 text-fg-2 transition-transform active:scale-75" aria-label="Favorite">
          <Heart className={cn('size-4 transition-colors', fav ? 'fill-heart text-heart' : 'fill-fg-2/80 text-fg-2/80')} />
        </button>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 px-2 text-[12px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolButton>
              {interval} <ChevronDown className="size-3 text-fg-2" />
            </ToolButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {INTERVALS.map((i) => (
              <DropdownMenuItem key={i} onSelect={() => (setIv(i), setBars(300), setRange(null))}>
                {i}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolButton>
              <span className="font-serif italic">fx</span> Indicators
              <span className="num rounded bg-chip px-1 text-[10.5px] text-fg-2">{volume ? 1 : 0}</span>
            </ToolButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuCheckboxItem checked={volume} onCheckedChange={(v) => setVolume(!!v)}>
              Volume
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolButton className={cn(compare && 'text-violet')}>
              <ArrowLeftRight className="size-3.5" /> {compare ? `vs ${compare.replace(/^xyz:/, '')}` : 'Compare'}
            </ToolButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuLabel>Overlay</DropdownMenuLabel>
            {favorites
              .filter((c) => c !== coin)
              .map((c) => (
                <DropdownMenuItem key={c} onSelect={() => setCompare(c)}>
                  <CoinIcon coin={c} className="size-4" /> {c.replace(/^xyz:/, '')}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolButton onClick={() => (setCompare(undefined), setVolume(true))} aria-label="Reset chart">
          <Trash2 className="size-3.5" />
        </ToolButton>
        {hover && (
          <span className="num ml-3 flex gap-2 text-[11px] text-fg-2">
            {(['o', 'h', 'l', 'c'] as const).map((k) => (
              <span key={k}>
                {k.toUpperCase()} <span className={hover.c >= hover.o ? 'text-up' : 'text-down'}>{fmtPx(hover[k])}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <CandleChart
          key={`${coin}-${interval}-${bars}`}
          coin={coin}
          interval={interval}
          bars={bars}
          showVolume={volume}
          logScale={log}
          percentScale={pctScale}
          compare={compare}
          onHover={setHover}
        />
      </div>

      <div className="flex h-8 shrink-0 items-center gap-0.5 px-2 text-[11px]">
        {RANGES.map((r) => (
          <button
            key={r.k}
            onClick={() => (setIv(r.interval), setBars(r.bars), setRange(r.k))}
            className={cn('rounded-md px-1.5 py-0.5 transition-colors', range === r.k ? 'bg-hover text-fg' : 'text-fg-3 hover:text-fg')}
          >
            {r.k}
          </button>
        ))}
        <span className="ml-auto flex gap-0.5">
          <button onClick={() => setPctScale(!pctScale)} className={cn('rounded-md px-1.5 py-0.5', pctScale ? 'text-brand' : 'text-fg-3 hover:text-fg')}>
            %
          </button>
          <button onClick={() => setLog(!log)} className={cn('rounded-md px-1.5 py-0.5', log ? 'text-brand' : 'text-fg-3 hover:text-fg')}>
            Log
          </button>
          <button onClick={() => (setLog(false), setPctScale(false))} className={cn('rounded-md px-1.5 py-0.5', !log && !pctScale ? 'text-brand' : 'text-fg-3 hover:text-fg')}>
            Auto
          </button>
        </span>
      </div>
    </div>
  )
}

function Stat({ k, v, className }: { k: string; v: React.ReactNode; className?: string }) {
  return (
    <span className={cn('flex flex-col gap-0.5 whitespace-nowrap', className)}>
      <span className="text-fg-2">{k}</span>
      <span className="num text-[12.5px] text-fg">{v}</span>
    </span>
  )
}

function ToolButton({ className, ...p }: React.ComponentProps<'button'>) {
  return (
    <button
      {...p}
      className={cn('flex h-6 items-center gap-1.5 rounded-md px-2 text-fg transition-colors hover:bg-hover data-[state=open]:bg-hover', className)}
    />
  )
}
