import { CandlestickSeries, HistogramSeries, LineSeries, type ISeriesApi } from 'lightweight-charts'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { LogoPulse } from '@/components/brand/Logo'
import { INTERVAL_MS, type CandleInterval } from '@/lib/hl'
import { useCandles } from '@/lib/useCandles'
import { cn } from '@/lib/utils'
import { CHART_COLORS, PX_FORMAT, ts, useChart } from './useChart'

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

export function CandleChart({
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
    const handler = (p: Parameters<Parameters<typeof chart.subscribeCrosshairMove>[0]>[0]) => {
      const bar = p.seriesData.get(c) as { open: number; high: number; low: number; close: number } | undefined
      const vol = p.seriesData.get(v) as { value: number } | undefined
      onHover?.(bar ? { o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: vol?.value ?? 0 } : undefined)
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
    c.setData(data.map((d) => ({ time: ts(d.t), open: d.o, high: d.h, low: d.l, close: d.c })))
    v.setData(data.map((d) => ({ time: ts(d.t), value: d.v * d.c, color: d.c >= d.o ? CHART_COLORS.upVol : CHART_COLORS.downVol })))
    if (!fitted.current) {
      chart?.timeScale().fitContent()
      fitted.current = true
    }
  }, [data, chart])

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
}
