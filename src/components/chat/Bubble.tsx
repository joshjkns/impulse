import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * iMessage-style bubble with a tail on the last bubble of a run. The tail is an SVG notch that inherits
 * the bubble color via currentColor, so it stays crisp at every size.
 */
export function Bubble({
  side,
  children,
  tail = true,
  className,
}: {
  side: 'user' | 'agent'
  children: ReactNode
  tail?: boolean
  className?: string
}) {
  const user = side === 'user'
  return (
    // No `layout` animation: it animated every change in the bubble's on-screen position, including the chat
    // window being dragged or resized, so messages sprang along behind the window instead of moving with it.
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 700, damping: 40, mass: 0.6 }}
      style={{ originX: user ? 1 : 0, originY: 1 }}
      className={cn('relative max-w-[86%]', user ? 'ml-auto text-bubble-user' : 'mr-auto text-bubble-agent', className)}
    >
      <div
        className={cn(
          'relative rounded-[18px] px-3 py-[7px] text-[12.5px] leading-[1.42]',
          user ? 'bg-bubble-user text-white' : 'bg-bubble-agent text-fg',
        )}
      >
        {children}
      </div>
      {tail && (
        <svg
          viewBox="0 0 17 21"
          className={cn('absolute bottom-0 h-[17px] w-[14px]', user ? '-right-[4.5px]' : '-left-[4.5px] -scale-x-100')}
          aria-hidden
        >
          <path d="M0 0v13.5C0 18 4 21 9 21h8c-4.5-1.5-7-5-7-9.5V0z" fill="currentColor" />
        </svg>
      )}
    </motion.div>
  )
}

export function TypingBubble() {
  return (
    <Bubble side="agent">
      <span className="flex h-[16px] items-center gap-[3px] px-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-[6px] animate-blink rounded-full bg-fg-2" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </span>
    </Bubble>
  )
}
