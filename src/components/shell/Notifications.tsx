import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { LogoMark } from '@/components/brand/Logo'
import { useUI } from '@/store/ui'

function ago(t: number, now: number) {
  const s = Math.floor((now - t) / 1000)
  if (s < 45) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/** System-style notification stack used for alert hits. Newest slides in on top and pushes the rest down. */
export function Notifications() {
  const items = useUI((s) => s.notifications)
  const dismiss = useUI((s) => s.dismiss)
  const nav = useNavigate()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="pointer-events-none fixed top-3 left-1/2 z-[60] flex w-[min(400px,calc(100vw-24px))] -translate-x-1/2 flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((n) => (
          <motion.button
            key={n.id}
            layout
            initial={{ opacity: 0, y: -18, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(8px)', transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }}
            onClick={() => {
              dismiss(n.id)
              nav('/feed')
            }}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-[18px] bg-[#1a1a1e]/95 p-3 text-left shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.07] backdrop-blur-xl"
          >
            <span className="grid size-[38px] shrink-0 place-items-center rounded-[9px] bg-black text-white">
              <LogoMark className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between text-[11.5px] font-medium text-fg-2">
                Impulse <span className="font-normal">{ago(n.at, now)}</span>
              </span>
              <span className="mt-0.5 block text-[13.5px] leading-tight font-semibold text-fg">{n.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-fg/85">{n.body}</span>
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
