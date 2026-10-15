import { motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { useCandles } from '@/lib/useCandles'
import type { WidgetProps } from './registry'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LOOKBACK = 3 * 365 * 86_400_000

function color(v: number | undefined, max: number) {
  if (v == null) return '#26262a'
  const k = Math.min(1, Math.abs(v) / (max || 1))
  // Interpolate from a dim base to the saturated up/down color.
  const mix = (a: number[], b: number[]) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')})`
  return v >= 0 ? mix([22, 52, 36], [16, 150, 72]) : mix([58, 28, 34], [150, 40, 58])
}

/** Return in each calendar month since the market listed on Hyperliquid. */
export function MonthlyReturnsWidget({ coin, onReady }: WidgetProps) {
  const { data, loading } = useCandles(coin, '1d', LOOKBACK)

  const grid = useMemo(() => {
    const byMonth = new Map<string, { o: number; c: number }>()
    for (const d of data) {
      const dt = new Date(d.t)
      const k = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`
      const cur = byMonth.get(k)
      if (!cur) byMonth.set(k, { o: d.o, c: d.c })
      else cur.c = d.c
    }
    const years = Array.from(new Set(data.map((d) => new Date(d.t).getUTCFullYear()))).sort()
    const rows = years.map((y) => ({ y, cells: MONTHS.map((_, mi) => byMonth.get(`${y}-${mi}`)).map((x) => (x ? ((x.c - x.o) / x.o) * 100 : undefined)) }))
    const max = Math.max(1, ...rows.flatMap((r) => r.cells.filter((v): v is number => v != null).map(Math.abs)))
    return { rows, max }
  }, [data])

  useEffect(() => {
    if (!loading) onReady()
  }, [loading, onReady])

  return (
    <div className="absolute inset-0 flex flex-col px-3 pt-2 pb-3">
      <div className="flex min-h-0 flex-1 flex-col gap-[3px]">
        {grid.rows.map((r, ri) => (
          <div key={r.y} className="flex min-h-0 flex-1 items-stretch gap-[3px]">
            <span className="num w-9 self-center text-[11px] text-fg-2">{r.y}</span>
            {r.cells.map((v, i) => (
              <motion.div
                key={i}
                title={v != null ? `${MONTHS[i]} ${r.y}: ${v.toFixed(2)}%` : undefined}
                initial={{ opacity: 0, scaleY: 0.6 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ duration: 0.28, delay: (ri * 12 + i) * 0.012, ease: [0.2, 0.9, 0.1, 1] }}
                className="group relative flex-1 rounded-[2px]"
                style={{ background: color(v, grid.max), originY: 1 }}
              >
                {v != null && (
                  <span className="num absolute inset-x-0 top-1/2 hidden -translate-y-1/2 text-center text-[10px] text-white/90 group-hover:block">
                    {v > 0 ? '+' : ''}
                    {v.toFixed(1)}%
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px] pl-9 text-[11px] text-fg-2">
        {MONTHS.map((m) => (
          <span key={m} className="flex-1 text-center">
            {m}
          </span>
        ))}
      </div>
      <div className="mx-auto mt-2 w-[45%] min-w-40">
        <div className="h-[6px] rounded-full" style={{ background: `linear-gradient(90deg, ${color(-grid.max, grid.max)}, #26262a 50%, ${color(grid.max, grid.max)})` }} />
        <div className="num mt-1 flex justify-between text-[11px] text-fg-2">
          <span>-{grid.max.toFixed(2)}%</span>
          <span>0%</span>
          <span>+{grid.max.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  )
}
