import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CoinIcon } from '@/components/common'
import { cn } from '@/lib/utils'
import { SegmentSlider } from './SegmentSlider'

/** Ticks shown under the leverage track, always ending at the market's max. */
function marksFor(max: number) {
  const base = [1, 2, 3, 5, 10, 20, 25, 40, 50].filter((v) => v < max)
  const picked = base.length > 3 ? [1, ...base.slice(-2)] : [1, ...base.filter((v) => v !== 1)]
  return Array.from(new Set([...picked, max]))
}

/** A little burst of stars when the slider hits max leverage. */
function Sparkles({ show }: { show: boolean }) {
  const stars = useMemo(
    () => Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2 + Math.random() * 0.6, d: 12 + Math.random() * 16, s: 5 + Math.random() * 5 })),
    // Re-seed each time the burst fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show],
  )
  return (
    <AnimatePresence>
      {show && (
        <motion.span key="burst" className="pointer-events-none absolute top-1/2 left-1/2" exit={{ opacity: 0 }}>
          {stars.map((st, i) => (
            <motion.svg
              key={i}
              viewBox="0 0 10 10"
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[#dfe7ff]"
              style={{ width: st.s, height: st.s }}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
              animate={{ x: Math.cos(st.a) * st.d - 8, y: Math.sin(st.a) * st.d, scale: [0, 1.2, 0.9], opacity: [1, 1, 0], rotate: 90 }}
              transition={{ duration: 0.9, ease: [0.2, 0.9, 0.1, 1], delay: i * 0.015 }}
            >
              <path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z" fill="currentColor" />
            </motion.svg>
          ))}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/**
 * Leverage editor. Rendered as an overlay positioned over the ticket (slightly wider than it), the way
 * the terminal does it, rather than a detached popover.
 */
export function LeveragePanel({
  open,
  onClose,
  coin,
  symbol,
  value,
  max,
  onConfirm,
  anchor,
  offsetY = 48,
}: {
  open: boolean
  onClose: () => void
  coin: string
  symbol: string
  value: number
  max: number
  onConfirm: (v: number) => void
  /** Element the panel overlays (the ticket). The panel is portalled so scroll containers can't clip it. */
  anchor: RefObject<HTMLElement | null>
  offsetY?: number
}) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>()
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    const width = Math.min(window.innerWidth - 24, Math.max(r.width + 110, 440))
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, r.left + r.width / 2 - width / 2))
    setPos({ top: r.top + offsetY, left, width })
  }, [open, anchor, offsetY])
  const [draft, setDraft] = useState(value)
  const [burst, setBurst] = useState(0)
  const prev = useRef(value)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) setDraft(Math.min(value, max))
  }, [open, value, max])
  useEffect(() => {
    if (draft === max && prev.current !== max) setBurst((b) => b + 1)
    prev.current = draft
  }, [draft, max])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [open, onClose])

  const marks = marksFor(max)

  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={ref}
          style={{ originY: 0, top: pos.top, left: pos.left, width: pos.width }}
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -4 }}
          transition={{ duration: 0.16, ease: [0.2, 0.9, 0.1, 1] }}
          className="fixed z-50 rounded-[16px] bg-panel shadow-[0_30px_80px_rgba(0,0,0,0.6)] ring-1 ring-white/[0.06]"
        >
          <div className="flex items-center gap-2 px-5 pt-4 pb-3">
            <CoinIcon coin={coin} className="size-[18px] rounded-full" />
            <span className="text-[14px] text-fg">{symbol}</span>
            <span className="h-3.5 w-px bg-white/15" />
            <span className="text-[14px] text-fg">Leverage</span>
            <button onClick={onClose} className="ml-auto text-fg-2 transition-colors hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex gap-3 px-5">
            <div className="min-w-0 flex-1">
              <SegmentSlider
                value={draft}
                min={1}
                max={max}
                step={1}
                ticks={marks}
                snap={0}
                onChange={setDraft}
                label={`${draft}x`}
                labelInside="thumb"
                className="h-[44px] overflow-visible"
              >
                <Sparkles key={burst} show={draft === max && burst > 0} />
              </SegmentSlider>
              <div className="relative mx-[10px] mt-2 h-4">
                {marks.map((m) => (
                  <button
                    key={m}
                    onClick={() => setDraft(m)}
                    className={cn('num absolute -translate-x-1/2 text-[12px] transition-colors', draft === m ? 'text-fg' : 'text-fg-2 hover:text-fg')}
                    style={{ left: `${((m - 1) / Math.max(1, max - 1)) * 100}%` }}
                  >
                    {m}x
                  </button>
                ))}
              </div>
            </div>
            <label className="flex h-[44px] w-[96px] shrink-0 items-center justify-center gap-1 rounded-[10px] bg-field text-[14px] text-fg">
              <input
                value={draft}
                onChange={(e) => {
                  const n = Math.round(Number(e.target.value.replace(/\D/g, '')) || 1)
                  setDraft(Math.min(max, Math.max(1, n)))
                }}
                className="num w-8 bg-transparent text-right outline-none"
              />
              <span className="text-fg-2">x</span>
            </label>
          </div>
          <div className="p-5">
            <button
              onClick={() => {
                onConfirm(draft)
                onClose()
              }}
              className="h-[46px] w-full rounded-[12px] bg-raised text-[14px] font-medium text-fg transition-colors duration-150 hover:bg-hover active:scale-[0.995]"
            >
              Confirm
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
