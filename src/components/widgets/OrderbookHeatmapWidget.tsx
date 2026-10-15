import { useEffect, useRef, useState } from 'react'
import { useBook } from '@/components/trade/Orderbook'
import { fmtPx } from '@/lib/format'
import { useMarket } from '@/store/markets'
import type { WidgetProps } from './registry'
import { LegendChip } from './WidgetFrame'

/** Viridis-ish ramp: deep indigo → teal → green → yellow, which reads well on the matte panel. */
const RAMP = [
  [30, 22, 64],
  [44, 50, 110],
  [33, 102, 128],
  [30, 150, 120],
  [96, 196, 84],
  [214, 226, 46],
  [250, 236, 70],
]
function ramp(t: number) {
  const x = Math.min(0.9999, Math.max(0, t)) * (RAMP.length - 1)
  const i = Math.floor(x)
  const f = x - i
  const a = RAMP[i]
  const b = RAMP[i + 1]
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`
}

interface Snap {
  t: number
  mid: number
  levels: [number, number][]
}

const MAX_SNAPS = 360
const AXIS_W = 64

/** Dollars resting at each price level over time, sampled from the live L2 book since the widget opened. */
export function OrderbookHeatmapWidget({ coin, onReady }: WidgetProps) {
  const m = useMarket(coin)
  // 3 significant figures ≈ 20 levels covering a few percent either side of mid.
  const book = useBook(coin, 3)
  const snaps = useRef<Snap[]>([])
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [axis, setAxis] = useState<{ y: number; px: number }[]>([])
  const [midTag, setMidTag] = useState<{ y: number; px: number }>()
  const [times, setTimes] = useState<{ x: number; label: string }[]>([])

  useEffect(() => {
    snaps.current = []
  }, [coin])

  // Sample at most every 1.5s.
  useEffect(() => {
    if (!book?.bids.length || !book.asks.length) return
    const last = snaps.current[snaps.current.length - 1]
    if (last && Date.now() - last.t < 1500) return
    const mid = (book.bids[0].px + book.asks[0].px) / 2
    snaps.current.push({ t: Date.now(), mid, levels: [...book.bids, ...book.asks].map((l) => [l.px, l.px * l.sz]) })
    if (snaps.current.length > MAX_SNAPS) snaps.current.shift()
    draw()
    if (snaps.current.length === 1) onReady()
  }, [book]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ro = new ResizeObserver(() => draw())
    if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const c = canvas.current
    const w = wrap.current
    const list = snaps.current
    if (!c || !w || !list.length) return
    const dpr = window.devicePixelRatio || 1
    const W = w.clientWidth - AXIS_W
    const H = w.clientHeight - 22
    if (W <= 0 || H <= 0) return
    c.width = W * dpr
    c.height = H * dpr
    c.style.width = `${W}px`
    c.style.height = `${H}px`
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const mid = list[list.length - 1].mid
    let lo = Infinity
    let hi = -Infinity
    let maxUsd = 1
    for (const s of list)
      for (const [px, usd] of s.levels) {
        if (px < lo) lo = px
        if (px > hi) hi = px
        if (usd > maxUsd) maxUsd = usd
      }
    // Keep the mid centred and pad a little.
    const span = Math.max(hi - mid, mid - lo) * 1.05 || mid * 0.01
    lo = mid - span
    hi = mid + span
    const yOf = (px: number) => H - ((px - lo) / (hi - lo)) * H
    // Columns stretch to fill the panel; time compresses as history accumulates.
    const colW = W / list.length
    const startX = 0
    const tick = list[0].levels.length > 1 ? Math.abs(list[0].levels[1][0] - list[0].levels[0][0]) || span / 40 : span / 40
    const rowH = Math.max(2, (tick / (hi - lo)) * H)
    const logMax = Math.log1p(maxUsd)

    list.forEach((s, i) => {
      const x = startX + i * colW
      for (const [px, usd] of s.levels) {
        ctx.fillStyle = ramp(Math.log1p(usd) / logMax)
        ctx.fillRect(x, yOf(px) - rowH / 2, colW + 0.5, rowH)
      }
    })
    // Mid line.
    ctx.strokeStyle = '#ff5d7a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    list.forEach((s, i) => {
      const x = startX + i * colW + colW / 2
      if (i === 0) ctx.moveTo(x, yOf(s.mid))
      else ctx.lineTo(x, yOf(s.mid))
    })
    ctx.stroke()
    const lx = startX + (list.length - 1) * colW + colW / 2
    ctx.fillStyle = '#ff5d7a'
    ctx.beginPath()
    ctx.arc(lx, yOf(mid), 3, 0, Math.PI * 2)
    ctx.fill()

    const ticks = 5
    setAxis(Array.from({ length: ticks }, (_, i) => {
      const px = lo + ((i + 0.5) / ticks) * (hi - lo)
      return { y: yOf(px), px }
    }))
    setMidTag({ y: yOf(mid), px: mid })
    const fmt = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    const labels: { x: number; label: string }[] = []
    list.forEach((s, i) => {
      const x = startX + i * colW + colW / 2
      const label = fmt(s.t)
      const prev = labels[labels.length - 1]
      if (x > 24 && x < W - 24 && (!prev || (x - prev.x > 90 && prev.label !== label))) labels.push({ x, label })
    })
    setTimes(labels)
  }

  const dec = m ? Math.max(0, 6 - m.szDecimals - 0) : 3

  return (
    <div className="absolute inset-0">
      <div className="absolute top-1 left-2 z-10 flex flex-col gap-1">
        <LegendChip color="#ff5d7a">Mid</LegendChip>
        <LegendChip color="linear-gradient(180deg,#faec46,#1e9678,#1e1640)">Resting size</LegendChip>
      </div>
      <div ref={wrap} className="absolute inset-0 top-5">
        <canvas ref={canvas} className="absolute top-0 left-0" />
        <div className="absolute top-0 right-0 bottom-[22px]" style={{ width: AXIS_W }}>
          {axis.map((a) => (
            <span key={a.px} className="num absolute right-2 -translate-y-1/2 text-[11px] text-fg-2" style={{ top: a.y }}>
              ${a.px.toFixed(Math.min(dec, 3))}
            </span>
          ))}
          {midTag && (
            <span className="num absolute right-1 -translate-y-1/2 rounded-[4px] bg-[#ff5d7a] px-1 py-[1px] text-[11px] text-white" style={{ top: midTag.y }}>
              ${fmtPx(midTag.px)}
            </span>
          )}
        </div>
        <div className="absolute right-0 bottom-0 left-0 h-[22px]" style={{ right: AXIS_W }}>
          {times.map((t) => (
            <span key={t.label + t.x} className="num absolute -translate-x-1/2 text-[11px] text-fg-2" style={{ left: t.x }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
