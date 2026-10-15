import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The terminal's slider: a recessed track with tick marks, a lighter fill up to a white pill thumb,
 * and an inline value label. Built on pointer events so the thumb tracks the cursor 1:1 and settles
 * with a short spring when snapping to a tick.
 */
export function SegmentSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  ticks = [0, 25, 50, 75, 100],
  onChange,
  label,
  labelInside = 'right',
  className,
  disabled,
  snap = 2,
  children,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  ticks?: number[]
  onChange: (v: number) => void
  label?: ReactNode
  labelInside?: 'right' | 'thumb'
  className?: string
  disabled?: boolean
  /** Snap to a tick when within this many units. */
  snap?: number
  children?: ReactNode
}) {
  const track = useRef<HTMLDivElement>(null)
  const pct = useMotionValue(((value - min) / (max - min)) * 100)
  const dragging = useRef(false)
  const left = useTransform(pct, (v) => `${v}%`)
  const width = useTransform(pct, (v) => `calc(${v}% + 10px)`)

  useEffect(() => {
    if (dragging.current) return
    animate(pct, ((value - min) / (max - min)) * 100, { duration: 0.18, ease: [0.2, 0.9, 0.1, 1] })
  }, [value, min, max, pct])

  const fromEvent = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    const inset = 10
    const p = Math.min(1, Math.max(0, (clientX - r.left - inset) / (r.width - inset * 2)))
    let v = min + p * (max - min)
    v = Math.round(v / step) * step
    const near = ticks.find((t) => Math.abs(t - v) <= snap)
    if (near != null) v = near
    return Math.min(max, Math.max(min, v))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    dragging.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const v = fromEvent(e.clientX)
    pct.set(((v - min) / (max - min)) * 100)
    onChange(v)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const v = fromEvent(e.clientX)
    pct.set(((v - min) / (max - min)) * 100)
    onChange(v)
  }
  const end = () => (dragging.current = false)

  return (
    <div
      ref={track}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      className={cn(
        'relative h-[34px] touch-none overflow-hidden rounded-[10px] bg-field select-none',
        disabled ? 'opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <div className="absolute inset-y-0 right-[10px] left-[10px]">
        <motion.div className="absolute inset-y-[-100px] -left-[10px] bg-white/[0.035]" style={{ width }} />
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute top-1/2 h-[11px] w-px -translate-y-1/2 bg-white/15"
            style={{ left: `${((t - min) / (max - min)) * 100}%` }}
          />
        ))}
        <motion.div
          className="absolute top-1/2 z-10 h-[20px] w-[8px] -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-[#e4e4e8] shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          style={{ left }}
        >
          {children}
        </motion.div>
        {label != null && labelInside === 'thumb' && (
          <motion.span
            className="num pointer-events-none absolute top-1/2 -translate-x-[calc(100%+10px)] -translate-y-1/2 text-[12px] text-fg-3"
            style={{ left }}
          >
            {label}
          </motion.span>
        )}
      </div>
      {label != null && labelInside === 'right' && (
        <span className="num pointer-events-none absolute top-1/2 right-[22px] -translate-y-1/2 text-[12px] text-fg-2">{label}</span>
      )}
    </div>
  )
}

