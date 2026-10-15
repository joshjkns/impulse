import { CandlestickSeries, HistogramSeries, LineSeries, type ISeriesApi } from 'lightweight-charts'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useRef } from 'react'
import { LogoPulse } from '@/components/brand/Logo'
import { INTERVAL_MS, type CandleInterval } from '@/lib/hl'
import { useCandles } from '@/lib/useCandles'
import { cn } from '@/lib/utils'
import { CHART_COLORS, PX_FORMAT, diffBars, ts, useChart } from './useChart'
import type { Candle } from '@/lib/hl'

export interface CandleChartProps {
  coin: string
  interval: CandleInterval
  bars?: number
  live?: boolean
  showVolume?: boolean
  logScale?: boolean
  percentScale?: boolean
  compare?: string
  className?: string
  onHover?: (bar?: { o: number; h: number; l: number; c: number; v: number }) => void
}

/** Memoised: parents that tick (live stats, countdowns, crosshair readouts) don't re-render the chart. */
export const CandleChart = memo(function CandleChart({
  coin,
  interval,
  bars = 300,
  live = true,
  showVolume = true,
  logScale,
  percentScale,
  compare,
  className,
  onHover,
}: CandleChartProps) {
  const { ref, chart } = useChart()
  const { data, loading } = useCandles(coin, interval, INTERVAL_MS[interval] * bars, live)
  const cmp = useCandles(compare, interval, INTERVAL_MS[interval] * bars, false)
  const series = useRef<{ c?: ISeriesApi<'Candlestick'>; v?: ISeriesApi<'Histogram'>; cmp?: ISeriesApi<'Line'> }>({})
  const fitted = useRef(false)
  const pushed = useRef<Candle[]>(undefined)
  // Hover handler lives in a ref so the crosshair subscription never has to be re-made.
  const hoverRef = useRef(onHover)
  hoverRef.current = onHover

  useEffect(() => {
    if (!chart) return
    const c = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.up,
      downColor: CHART_COLORS.down,
      wickUpColor: CHART_COLORS.up,
      wickDownColor: CHART_COLORS.down,
      borderVisible: false,
      priceLineColor: '#6b6b74',
      priceLineStyle: 2,
      priceFormat: PX_FORMAT,
    })
    const v = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
    series.current = { c, v }
    pushed.current = undefined
    const handler = (p: Parameters<Parameters<typeof chart.subscribeCrosshairMove>[0]>[0]) => {
      const bar = p.seriesData.get(c) as { open: number; high: number; low: number; close: number } | undefined
      const vol = p.seriesData.get(v) as { value: number } | undefined
      hoverRef.current?.(bar ? { o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: vol?.value ?? 0 } : undefined)
    }
    chart.subscribeCrosshairMove(handler)
    return () => chart.unsubscribeCrosshairMove(handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart])

  useEffect(() => {
    chart?.priceScale('right').applyOptions({ mode: percentScale ? 2 : logScale ? 1 : 0 })
  }, [chart, logScale, percentScale])

  useEffect(() => {
    series.current.v?.applyOptions({ visible: showVolume })
  }, [showVolume, chart])

  useEffect(() => {
    fitted.current = false
  }, [coin, interval])

  useEffect(() => {
    const { c, v } = series.current
    if (!c || !v || !data.length) return
    const bar = (d: Candle) => ({ time: ts(d.t), open: d.o, high: d.h, low: d.l, close: d.c })
    const vol = (d: Candle) => ({ time: ts(d.t), value: d.v * d.c, color: d.c >= d.o ? CHART_COLORS.upVol : CHART_COLORS.downVol })
    const change = diffBars(pushed, data)
    if (change === 'tick') {
      const last = data[data.length - 1]
      c.update(bar(last))
      v.update(vol(last))
    } else if (change === 'reset') {
      c.setData(data.map(bar))
      v.setData(data.map(vol))
    }
    // Fit once the history is in; fitting to the first live bar or two leaves the chart zoomed onto them.
    if (!fitted.current && !loading) {
      chart?.timeScale().fitContent()
      fitted.current = true
    }
  }, [data, loading, chart])

  useEffect(() => {
    if (!chart) return
    if (series.current.cmp) {
      chart.removeSeries(series.current.cmp)
      series.current.cmp = undefined
    }
    if (!compare || !cmp.data.length) return
    const s = chart.addSeries(LineSeries, { color: CHART_COLORS.violet, lineWidth: 1, priceScaleId: 'cmp', lastValueVisible: false, priceLineVisible: false })
    chart.priceScale('cmp').applyOptions({ visible: false, scaleMargins: { top: 0.12, bottom: 0.2 } })
    s.setData(cmp.data.map((d) => ({ time: ts(d.t), value: d.c })))
    series.current.cmp = s
  }, [chart, compare, cmp.data])

  return (
    <div className={cn('relative h-full w-full', className)}>
      <div ref={ref} className="absolute inset-0" />
      <AnimatePresence>
        {loading && !data.length && (
          <motion.div exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center">
            <LogoPulse className="size-7" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
