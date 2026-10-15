import { LineSeries, createSeriesMarkers, type ISeriesApi, type SeriesMarker, type Time } from 'lightweight-charts'
import { useEffect, useMemo, useRef } from 'react'
import { CHART_COLORS, PX_FORMAT, diffBars, ts, useChart } from '@/components/charts/useChart'
import { useCandles } from '@/lib/useCandles'
import type { Candle } from '@/lib/hl'
import { useMarketMeta } from '@/store/markets'
import type { WidgetProps } from './registry'
import { LegendChip } from './WidgetFrame'

const DAYS3 = 3 * 86_400_000

/**
 * Hyperliquid has no public liquidation history, so we flag the hours that look like forced flow:
 * volume far above normal together with an outsized wick. A long wick down on a volume spike marks
 * longs being liquidated (red); a wick up marks shorts being squeezed (green).
 */
export function LiquidationsWidget({ coin, onReady }: WidgetProps) {
  const m = useMarketMeta(coin)
  const { ref, chart } = useChart()
  const { data } = useCandles(coin, '1h', DAYS3, true)
  const series = useRef<ISeriesApi<'Line'>>(undefined)
  const markers = useRef<ReturnType<typeof createSeriesMarkers<Time>>>(undefined)
  const pushed = useRef<Candle[]>(undefined)
  const markerKey = useRef('')

  const flagged = useMemo(() => {
    if (data.length < 10) return []
    const vols = data.map((d) => d.v * d.c)
    const mean = vols.reduce((a, b) => a + b, 0) / vols.length
    const sd = Math.sqrt(vols.reduce((a, v) => a + (v - mean) ** 2, 0) / vols.length) || 1
    return data
      .map((d, i) => {
        const z = (vols[i] - mean) / sd
        const range = (d.h - d.l) / d.o
        const lowerWick = (Math.min(d.o, d.c) - d.l) / d.o
        const upperWick = (d.h - Math.max(d.o, d.c)) / d.o
        return { d, score: z * range * 100, longs: lowerWick > upperWick || d.c < d.o, usd: vols[i] }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
  }, [data])

  useEffect(() => {
    if (!chart) return
    series.current = chart.addSeries(LineSeries, { color: CHART_COLORS.blue, lineWidth: 2, priceLineVisible: false, priceFormat: PX_FORMAT })
    markers.current = createSeriesMarkers(series.current, [])
    pushed.current = undefined
    markerKey.current = ''
  }, [chart])

  useEffect(() => {
    if (!series.current || !data.length) return
    const change = diffBars(pushed, data)
    if (change === 'tick') series.current.update({ time: ts(data[data.length - 1].t), value: data[data.length - 1].c })
    else if (change === 'reset') series.current.setData(data.map((d) => ({ time: ts(d.t), value: d.c })))
    // Markers only move when the set of flagged hours does, not on every live tick.
    const key = flagged.map(({ d, longs }) => `${d.t}${longs ? 'l' : 's'}`).join()
    if (key !== markerKey.current) {
      markerKey.current = key
      const ms: SeriesMarker<Time>[] = flagged
        .map(({ d, longs }) => ({
          time: ts(d.t),
          position: longs ? ('belowBar' as const) : ('aboveBar' as const),
          shape: 'circle' as const,
          color: longs ? '#e8b34a' : '#3ccf73',
          text: '$',
          size: 1,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number))
      markers.current?.setMarkers(ms)
    }
    if (change === 'reset') {
      chart?.timeScale().fitContent()
      onReady()
    }
  }, [data, flagged, chart, onReady])

  return (
    <div className="absolute inset-0">
      <div className="absolute top-1 left-2 z-10 flex gap-1">
        <LegendChip color={CHART_COLORS.blue}>{m?.symbol ?? coin}</LegendChip>
        <LegendChip color="#3ccf73">Shorts squeezed</LegendChip>
        <LegendChip color="#e8b34a">Longs flushed</LegendChip>
      </div>
      <div ref={ref} className="absolute inset-0 top-5" />
    </div>
  )
}
