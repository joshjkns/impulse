import { motion } from 'motion/react'
import { useState } from 'react'
import { OrderTicket } from '@/components/trade/OrderTicket'
import type { ProposedOrder } from '@/store/chat'

/** An agent-suggested trade, rendered as a live, editable ticket. Nothing executes until the user presses Place. */
export function OrderProposal({ order }: { order: ProposedOrder }) {
  const [done, setDone] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.9, 0.1, 1] }}
      className="mr-auto w-full max-w-[340px] overflow-visible rounded-[18px] bg-canvas ring-1 ring-white/[0.06]"
    >
      {done ? (
        <div className="p-4 text-[12.5px] text-fg-2">Order sent. Track it in Positions.</div>
      ) : (
        <OrderTicket coin={order.coin} variant="card" initial={order} onDone={() => setDone(true)} />
      )}
    </motion.div>
  )
}
