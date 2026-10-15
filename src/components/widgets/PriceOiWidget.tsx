import { AreaSeries, LineSeries } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { CHART_COLORS, PX_FORMAT, diffBars, ts, useChart } from '@/components/charts/useChart'
import { fmtCompact } from '@/lib/format'
import { useCandles } from '@/lib/useCandles'
import type { Candle } from '@/lib/hl'
import { useMarketMeta, useMarkets } from '@/store/markets'
import type { WidgetProps } from './registry'
import { LegendChip } from './WidgetFrame'

const MONTH = 30 * 86_400_000
const BRIDGE_HTTP = 'http://127.0.0.1:7420'

/** Hourly open-interest history recorded by the bridge (Hyperliquid has no OI history endpoint). */
function useOiHistory(coin: string) {
  const [rows, setRows] = useState<[number, number][]>([])
  useEffect(() => {
    let alive = true
    const load = () =>
      fetch(`${BRIDGE_HTTP}/oi?coin=${encodeURIComponent(coin)}`)
        .then((r) => r.json() as Promise<[number, number][]>)
        .then((d) => alive && setRows(d))
        .catch(() => undefined)
    void load()
    const t = setInterval(load, 5 * 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [coin])
  return rows
}

export function PriceOiWidget({ coin, onReady }: WidgetProps) {
  const m = useMarketMeta(coin)
  const { ref, chart } = useChart({ rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } } })
  const { data } = useCandles(coin, '1h', MONTH, true)
  const oi = useOiHistory(coin)
  const pushed = useRef<Candle[]>(undefined)
  const [series, setSeries] = useState<{ price: ReturnType<NonNullable<typeof chart>['addSeries']>; oi: ReturnType<NonNullable<typeof chart>['addSeries']> }>()

  useEffect(() => {
    if (!chart) return
    const price = chart.addSeries(LineSeries, { color: CHART_COLORS.blue, lineWidth: 2, priceLineVisible: false, priceFormat: PX_FORMAT })
    const oiS = chart.addSeries(
      AreaSeries,
      {
        lineColor: CHART_COLORS.violet,
        topColor: 'rgba(165,134,255,0.35)',
        bottomColor: 'rgba(165,134,255,0.04)',
        lineWidth: 1,
        priceLineVisible: false,
        priceFormat: { type: 'custom', formatter: (v: number) => fmtCompact(v) },
      },
      1,
    )
    chart.panes()[1]?.setHeight(52)
    pushed.current = undefined
    setSeries({ price, oi: oiS })
  }, [chart])

  // Price: full history once, then only the live bar moves.
  useEffect(() => {
    if (!series || !data.length) return
    const change = diffBars(pushed, data)
    if (change === 'tick') series.price.update({ time: ts(data[data.length - 1].t), value: data[data.length - 1].c })
    else if (change === 'reset') {
      series.price.setData(data.map((d) => ({ time: ts(d.t), value: d.c })))
      chart?.timeScale().fitContent()
      onReady()
    }
  }, [series, data, chart, onReady])

  // Open interest only changes when the bridge's hourly history does (or the window it's clipped to moves).
  const start = data[0]?.t
  const end = data[data.length - 1]?.t
  useEffect(() => {
    if (!series || start == null || end == null) return
    // Until the bridge has history, show the live value as a flat line so the pane isn't empty.
    const live = useMarkets.getState().markets[coin]?.openInterest
    const points = oi.length > 1 ? oi : live != null ? [[start, live], [end, live]] : []
    series.oi.setData(points.filter(([t]) => t >= start).map(([t, v]) => ({ time: ts(t), value: v })))
  }, [series, oi, start, end, coin])

  return (
    <div className="absolute inset-0">
      <div className="absolute top-1 left-2 z-10 flex gap-1">
        <LegendChip color={CHART_COLORS.blue}>{m?.symbol ?? coin}</LegendChip>
      </div>
      <div className="absolute bottom-[86px] left-2 z-10 text-[10.5px] text-fg-2" title={oi.length < 2 ? 'History builds while the bridge runs' : undefined}>
        Open interest
      </div>
      <div ref={ref} className="absolute inset-0 top-5" />
    </div>
  )
}
