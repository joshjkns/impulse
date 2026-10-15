import { HistogramSeries, type ISeriesApi } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { CHART_COLORS, ts, useChart } from '@/components/charts/useChart'
import { fetchFunding } from '@/lib/hl'
import type { WidgetProps } from './registry'
import { LegendChip } from './WidgetFrame'

const MONTH = 30 * 86_400_000
const BUCKET = 8 * 3_600_000

/** Annualised funding, averaged per 8 hours over the past month. */
export function FundingWidget({ coin, onReady }: WidgetProps) {
  const { ref, chart } = useChart()
  const series = useRef<ISeriesApi<'Histogram'>>(undefined)
  const [rows, setRows] = useState<{ t: number; v: number }[]>([])

  useEffect(() => {
    let alive = true
    // fundingHistory pages at 500 rows; a month of hourly funding is ~720, so fetch in two halves.
    Promise.all([fetchFunding(coin, MONTH), fetchFunding(coin, MONTH / 2)])
      .then(([a, b]) => {
        const all = new Map<number, number>()
        ;[...a, ...b].forEach((r) => all.set(r.t, r.rate))
        const buckets = new Map<number, number[]>()
        for (const [t, r] of all) {
          const k = Math.floor(t / BUCKET) * BUCKET
          const list = buckets.get(k) ?? []
          list.push(r)
          buckets.set(k, list)
        }
        const out = [...buckets.entries()].sort((x, y) => x[0] - y[0]).map(([t, xs]) => ({ t, v: (xs.reduce((p, q) => p + q, 0) / xs.length) * 24 * 365 * 100 }))
        if (alive) setRows(out)
      })
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [coin])

  useEffect(() => {
    if (!chart) return
    series.current = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: 'custom', formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%` },
      base: 0,
    })
    chart.applyOptions({ timeScale: { timeVisible: false } })
  }, [chart])

  useEffect(() => {
    if (!series.current || !rows.length) return
    series.current.setData(rows.map((r) => ({ time: ts(r.t), value: r.v, color: r.v >= 0 ? CHART_COLORS.up : CHART_COLORS.down })))
    chart?.timeScale().fitContent()
    onReady()
  }, [rows, chart, onReady])

  return (
    <div className="absolute inset-0">
      <div className="absolute top-1 left-2 z-10">
        <LegendChip>Funding APR</LegendChip>
      </div>
      <div ref={ref} className="absolute inset-0 top-5" />
    </div>
  )
}
