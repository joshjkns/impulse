import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { LogoMark } from '@/components/brand/Logo'
import { useMarkets } from '@/store/markets'

const WORDS = ['Trade', 'with', 'superhuman']

/**
 * Launch splash, once per session: the tagline blurs in word by word, "impulse." lands last,
 * then the mark detonates outward and the terminal fades up underneath.
 */
export function Splash() {
  const loaded = useMarkets((s) => s.loaded)
  const [phase, setPhase] = useState<'tagline' | 'logo' | 'done'>(() => {
    try {
      return sessionStorage.getItem('impulse.splash') ? 'done' : 'tagline'
    } catch {
      return 'tagline'
    }
  })

  useEffect(() => {
    if (phase === 'tagline') {
      const t = setTimeout(() => setPhase('logo'), 1500)
      return () => clearTimeout(t)
    }
    if (phase === 'logo' && loaded) {
      const t = setTimeout(() => {
        setPhase('done')
        try {
          sessionStorage.setItem('impulse.splash', '1')
        } catch {
          /* ignore */
        }
      }, 900)
      return () => clearTimeout(t)
    }
  }, [phase, loaded])

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[100] grid place-items-center bg-black"
          exit={{ opacity: 0, transition: { duration: 0.45, ease: [0.2, 0.9, 0.1, 1] } }}
          onClick={() => setPhase('done')}
        >
          <AnimatePresence mode="wait">
            {phase === 'tagline' ? (
              <motion.h1
                key="tagline"
                exit={{ opacity: 0, filter: 'blur(10px)', transition: { duration: 0.25 } }}
                className="flex flex-wrap justify-center gap-x-[0.28em] px-6 text-[clamp(28px,5vw,64px)] font-medium tracking-[-0.035em] text-[#f1f0ec]"
              >
                {WORDS.map((w, i) => (
                  <motion.span
                    key={w}
                    initial={{ opacity: 0, filter: 'blur(12px)', y: 8 }}
                    animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                    transition={{ duration: 0.45, delay: i * 0.12, ease: [0.2, 0.9, 0.1, 1] }}
                  >
                    {w}
                  </motion.span>
                ))}
                <motion.span
                  initial={{ opacity: 0, filter: 'blur(16px)' }}
                  animate={{ opacity: 0.85, filter: 'blur(0px)' }}
                  transition={{ duration: 0.6, delay: 0.5, ease: [0.2, 0.9, 0.1, 1] }}
                  className="text-[#cfcdc6]"
                >
                  impulse.
                </motion.span>
              </motion.h1>
            ) : (
              <motion.div
                key="logo"
                initial={{ opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
                transition={{ duration: 0.4, ease: [0.2, 0.9, 0.1, 1] }}
                className="relative flex items-center gap-4 text-[#f1f0ec]"
              >
                <span className="relative">
                  <LogoMark className="size-[clamp(44px,6vw,76px)]" />
                  {[0, 1].map((i) => (
                    <motion.span
                      key={i}
                      className="absolute inset-0 rounded-full border-2 border-[#f1f0ec]"
                      initial={{ scale: 0.4, opacity: 0.7 }}
                      animate={{ scale: 2.6, opacity: 0 }}
                      transition={{ duration: 1.1, delay: 0.15 + i * 0.18, ease: [0.2, 0.9, 0.1, 1] }}
                    />
                  ))}
                </span>
                <span className="text-[clamp(44px,7vw,92px)] font-bold tracking-[-0.05em]">Impulse</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
