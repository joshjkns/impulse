import { LineSeries, type ISeriesApi } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CHART_COLORS, PX_FORMAT, ts, useChart } from '@/components/charts/useChart'
import { useCandles } from '@/lib/useCandles'
import { useMarket } from '@/store/markets'
import type { WidgetProps } from './registry'
import { LegendChip } from './WidgetFrame'

const MONTH = 30 * 86_400_000
const BINS = 48

/** Where the market traded over 30 days: hourly price plus a horizontal up/down volume histogram. */
export function VolumeProfileWidget({ coin, onReady }: WidgetProps) {
  const m = useMarket(coin)
  const { ref, chart } = useChart({ rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.06, bottom: 0.06 } } })
  const { data } = useCandles(coin, '1h', MONTH)
  const series = useRef<ISeriesApi<'Line'>>(undefined)
  const [bars, setBars] = useState<{ y: number; h: number; up: number; down: number }[]>([])
  const [plotW, setPlotW] = useState(0)

  const profile = useMemo(() => {
    if (!data.length) return null
    const lo = Math.min(...data.map((d) => d.l))
    const hi = Math.max(...data.map((d) => d.h))
    const step = (hi - lo) / BINS || 1
    const bins = Array.from({ length: BINS }, (_, i) => ({ px: lo + step * (i + 0.5), up: 0, down: 0 }))
    for (const d of data) {
      const i = Math.min(BINS - 1, Math.max(0, Math.floor(((d.h + d.l + d.c) / 3 - lo) / step)))
      const usd = d.v * d.c
      if (d.c >= d.o) bins[i].up += usd
      else bins[i].down += usd
    }
    return { bins, step }
  }, [data])

  useEffect(() => {
    if (!chart) return
    series.current = chart.addSeries(LineSeries, { color: CHART_COLORS.blue, lineWidth: 1, priceLineVisible: false, priceFormat: PX_FORMAT })
  }, [chart])

  useEffect(() => {
    if (!series.current || !data.length) return
    series.current.setData(data.map((d) => ({ time: ts(d.t), value: d.c })))
    chart?.timeScale().fitContent()
    onReady()
  }, [data, chart, onReady])

  // Project bins into pixel space whenever the chart re-scales.
  useEffect(() => {
    if (!chart || !profile || !series.current) return
    const s = series.current
    const layout = () => {
      setPlotW(chart.timeScale().width())
      setBars(
        profile.bins.map((b) => {
          const y1 = s.priceToCoordinate(b.px + profile.step / 2) ?? 0
          const y2 = s.priceToCoordinate(b.px - profile.step / 2) ?? 0
          return { y: Math.min(y1, y2), h: Math.max(1, Math.abs(y2 - y1) - 1), up: b.up, down: b.down }
        }),
      )
    }
    const raf = requestAnimationFrame(layout)
    chart.timeScale().subscribeVisibleLogicalRangeChange(layout)
    chart.timeScale().subscribeSizeChange(layout)
    return () => {
      cancelAnimationFrame(raf)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(layout)
      chart.timeScale().unsubscribeSizeChange(layout)
    }
  }, [chart, profile])

  const max = Math.max(1, ...bars.map((b) => b.up + b.down))
  const width = plotW * 0.42

  return (
    <div className="absolute inset-0">
      <div className="absolute top-1 left-2 z-10 flex flex-col gap-1">
        <LegendChip color={CHART_COLORS.blue}>{m?.symbol ?? coin}</LegendChip>
        <LegendChip color={CHART_COLORS.up}>Up volume</LegendChip>
        <LegendChip color={CHART_COLORS.down}>Down volume</LegendChip>
      </div>
      <div className="absolute inset-0 top-5">
        <div ref={ref} className="absolute inset-0" />
        <svg className="pointer-events-none absolute top-0 left-0 h-full" style={{ width: plotW }}>
          {bars.map((b, i) => {
            const total = ((b.up + b.down) / max) * width
            const up = (b.up / max) * width
            return (
              <g key={i}>
                <rect x={plotW - total} y={b.y} width={total - up} height={b.h} fill="rgba(239,64,96,0.55)" />
                <rect x={plotW - up} y={b.y} width={up} height={b.h} fill="rgba(34,197,94,0.6)" />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
