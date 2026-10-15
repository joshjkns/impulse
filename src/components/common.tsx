import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { fmtPx } from '@/lib/format'
import { iconUrl } from '@/lib/hl'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/store/prefs'

export function CoinIcon({ coin, className }: { coin: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const sym = coin.includes(':') ? coin.split(':')[1] : coin
  if (failed)
    return (
      <span className={cn('grid size-5 shrink-0 place-items-center rounded-md bg-chip text-[9px] font-semibold text-fg-2', className)}>
        {sym.slice(0, 2)}
      </span>
    )
  return (
    <img
      src={iconUrl(coin)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('size-5 shrink-0 rounded-md object-cover', className)}
    />
  )
}

/** Tiny line chart with a soft area fill, colored by direction. Used in tickers and the market strip. */
export function Sparkline({
  values,
  className,
  up,
  fill = true,
  baseline,
}: {
  values: number[]
  className?: string
  up?: boolean
  fill?: boolean
  baseline?: number
}) {
  const id = useMemo(() => `sp${Math.random().toString(36).slice(2)}`, [])
  if (values.length < 2) return <div className={className} />
  const min = Math.min(...values, baseline ?? Infinity)
  const max = Math.max(...values, baseline ?? -Infinity)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 100 - ((v - min) / span) * 92 - 4])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')
  const isUp = up ?? values[values.length - 1] >= values[0]
  const color = isUp ? 'var(--up)' : 'var(--down)'
  const by = baseline != null ? 100 - ((baseline - min) / span) * 92 - 4 : undefined
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn('overflow-visible', className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {by != null && <line x1="0" x2="100" y1={by} y2={by} stroke="#3a3a42" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
      {fill && <path d={`${d}L100,100L0,100Z`} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** Price that briefly tints green/red when it ticks — matches the terminal's subtle live feel. */
export function LivePrice({ value, decimals, className }: { value: number; decimals?: number; className?: string }) {
  const prev = useRef(value)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const enabled = usePrefs((s) => s.priceFlash)
  useEffect(() => {
    if (value === prev.current) return
    if (!enabled) {
      prev.current = value
      return
    }
    setFlash(value > prev.current ? 'up' : 'down')
    prev.current = value
    const t = setTimeout(() => setFlash(null), 450)
    return () => clearTimeout(t)
  }, [value, enabled])
  return (
    <span
      className={cn(
        'num transition-colors duration-300',
        flash === 'up' && 'text-up',
        flash === 'down' && 'text-down',
        className,
      )}
    >
      {fmtPx(value, decimals)}
    </span>
  )
}

/** A button that, when "Confirm orders" is on, needs a second press within 3s before it fires. */
export function ConfirmButton({ onConfirm, children, ...p }: Omit<ComponentProps<'button'>, 'onClick'> & { onConfirm: () => void }) {
  const confirm = usePrefs((s) => s.confirmOrders)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      {...p}
      onClick={() => {
        if (confirm && !armed) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
    >
      {armed ? 'Confirm?' : children}
    </button>
  )
}

export function IconButton({ className, children, ...p }: ComponentProps<'button'>) {
  return (
    <button
      {...p}
      className={cn(
        'grid size-7 place-items-center rounded-lg text-fg-2 transition-colors duration-150 hover:bg-hover hover:text-fg active:scale-95 disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="grid h-5 min-w-5 place-items-center rounded-[5px] bg-chip px-1 text-[11px] text-fg-2">{children}</kbd>
}

/** Fast fade+lift used for most mounted content. */
export const enter = {
  initial: { opacity: 0, y: 6, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: 4, filter: 'blur(4px)' },
  transition: { duration: 0.22, ease: [0.2, 0.9, 0.1, 1] },
} as const

export const Fade = motion.div
