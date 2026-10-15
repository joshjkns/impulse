import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * Impulse mark: a detonation core with two broken shockwave rings.
 * The ring gaps are offset so the mark reads as a burst travelling outward.
 */
export function LogoMark({ className, strokeWidth = 2.2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-6', className)} aria-hidden>
      <circle cx="16" cy="16" r="4.2" fill="currentColor" />
      <circle
        cx="16"
        cy="16"
        r="9"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray="12 4.2 6 4.2"
        transform="rotate(-28 16 16)"
      />
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="currentColor"
        strokeWidth={strokeWidth * 0.8}
        strokeLinecap="round"
        strokeDasharray="20 6 9 6 4 6"
        transform="rotate(64 16 16)"
        opacity="0.75"
      />
    </svg>
  )
}

/** Animated loader: the core pulses and rings ripple outward, used wherever content is being drawn. */
export function LogoPulse({ className }: { className?: string }) {
  const ring = (delay: number, r: number, w: number) => (
    <motion.circle
      cx="16"
      cy="16"
      r={r}
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeDasharray={r > 10 ? '20 6 9 6 4 6' : '12 4.2 6 4.2'}
      style={{ transformOrigin: '16px 16px' }}
      initial={{ scale: 0.55, opacity: 0, rotate: 0 }}
      animate={{ scale: [0.55, 1, 1.12], opacity: [0, 0.9, 0], rotate: 40 }}
      transition={{ duration: 1.3, repeat: Infinity, delay, ease: [0.2, 0.9, 0.1, 1] }}
    />
  )
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-6 text-fg-2', className)} aria-hidden>
      <motion.circle
        cx="16"
        cy="16"
        r="4.2"
        fill="currentColor"
        style={{ transformOrigin: '16px 16px' }}
        animate={{ scale: [1, 0.8, 1] }}
        transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
      />
      {ring(0, 9, 2.2)}
      {ring(0.22, 14, 1.8)}
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-fg', className)}>
      <LogoMark className="size-[1.15em]" />
      <span className="font-semibold tracking-[-0.04em]">Impulse</span>
    </div>
  )
}
