import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type DeepPartial,
  type ChartOptions,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { fmtPx } from '@/lib/format'

export const CHART_COLORS = {
  up: '#22c55e',
  down: '#ef4060',
  upVol: 'rgba(34,197,94,0.55)',
  downVol: 'rgba(239,64,96,0.55)',
  blue: '#4c9cff',
  violet: '#a586ff',
  text: '#8d8d96',
  grid: 'rgba(255,255,255,0.035)',
  line: '#2a2a31',
}

export const chartTheme: DeepPartial<ChartOptions> = {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: CHART_COLORS.text,
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui',
    fontSize: 11,
    attributionLogo: false,
  },
  grid: { vertLines: { visible: false }, horzLines: { visible: false } },
  rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
  timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: '#55555e', style: LineStyle.Dashed, width: 1, labelBackgroundColor: '#2c2c32' },
    horzLine: { color: '#55555e', style: LineStyle.Dashed, width: 1, labelBackgroundColor: '#2c2c32' },
  },
  handleScale: { axisPressedMouseMove: true },
}

/** Price axis/labels in the terminal's 5-significant-figure style. Apply per price series. */
export const PX_FORMAT = { type: 'custom' as const, formatter: (p: number) => fmtPx(p), minMove: 0.000001 }

export const ts = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp

/** Creates a lightweight-chart bound to a div ref; returns the api once mounted. */
export function useChart(options?: DeepPartial<ChartOptions>) {
  const ref = useRef<HTMLDivElement>(null)
  const [chart, setChart] = useState<IChartApi>()
  useEffect(() => {
    if (!ref.current) return
    const c = createChart(ref.current, { ...chartTheme, ...options })
    setChart(c)
    return () => {
      setChart(undefined)
      c.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { ref, chart }
}

/**
 * How a new candle array relates to the last one pushed into a chart: unchanged, only the live (last) bar moved
 * or one bar was appended, or anything else. Live ticks then cost one `series.update()` instead of a full
 * `setData()` of the whole history, and the user's zoom/scroll survives them.
 *
 * The first bar must match in time *and* price: a chart switched to another market with the same interval and
 * lookback starts at the same timestamp, and must still get a full reset.
 */
export function diffBars(prev: { current?: readonly Bar[] }, data: readonly Bar[]): 'same' | 'tick' | 'reset' {
  const p = prev.current
  prev.current = data
  if (p === data) return 'same'
  if (!p?.length || !data.length || p[0].t !== data[0].t) return 'reset'
  const grew = data.length - p.length
  if (grew !== 0 && grew !== 1) return 'reset'
  // A one-bar array's only bar is the live one, whose prices move; otherwise the first bar is settled history.
  if (p.length > 1 && (p[0].o !== data[0].o || p[0].c !== data[0].c)) return 'reset'
  // Everything before the live bar must be the same bars as before.
  const before = data.length - 2
  if (before >= 0 && data[before].t !== p[grew === 0 ? before : p.length - 1].t) return 'reset'
  return 'tick'
}
type Bar = { t: number; o: number; c: number }
