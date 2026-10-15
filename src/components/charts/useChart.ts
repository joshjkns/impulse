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
