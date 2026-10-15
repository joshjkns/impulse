import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { LogoMark } from '@/components/brand/Logo'
import { useMarkets } from '@/store/markets'

/** How long the mark holds once data is in, and the most it waits for data. */
const LOGO_MS = 350
const LOGO_MAX_MS = 1500

/**
 * Launch splash, once per session: the mark detonates outward and the terminal fades up underneath.
 */
export function Splash() {
  const loaded = useMarkets((s) => s.loaded)
  const [phase, setPhase] = useState<'logo' | 'done'>(() => {
    try {
      return sessionStorage.getItem('impulse.splash') ? 'done' : 'logo'
    } catch {
      return 'logo'
    }
  })

  const [waited, setWaited] = useState(false)
  useEffect(() => {
    if (phase !== 'logo') return
    // Never hold the terminal hostage to a slow network: it shows its own loading states.
    const cap = setTimeout(() => setWaited(true), LOGO_MAX_MS)
    if (!loaded && !waited) return () => clearTimeout(cap)
    const t = setTimeout(() => {
      setPhase('done')
      try {
        sessionStorage.setItem('impulse.splash', '1')
      } catch {
        /* ignore */
      }
    }, loaded ? LOGO_MS : 0)
    return () => {
      clearTimeout(cap)
      clearTimeout(t)
    }
  }, [phase, loaded, waited])

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[100] grid place-items-center bg-canvas"
          exit={{ opacity: 0, transition: { duration: 0.3, ease: [0.2, 0.9, 0.1, 1] } }}
          onClick={() => setPhase('done')}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.3, ease: [0.2, 0.9, 0.1, 1] }}
            className="relative flex items-center gap-4 text-fg"
          >
            <span className="relative">
              <LogoMark className="size-[clamp(44px,6vw,76px)]" />
              {[0, 1].map((i) => (
                <motion.span
                  key={i}
                  className="absolute inset-0 rounded-full border-2 border-fg"
                  initial={{ scale: 0.4, opacity: 0.7 }}
                  animate={{ scale: 2.6, opacity: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.12, ease: [0.2, 0.9, 0.1, 1] }}
                />
              ))}
            </span>
            <span className="text-[clamp(44px,7vw,92px)] font-bold tracking-[-0.05em]">Impulse</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
