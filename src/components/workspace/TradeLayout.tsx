import { motion } from 'motion/react'
import { AccountSummary } from '@/components/trade/AccountSummary'
import { ChartPanel } from '@/components/trade/ChartPanel'
import { OrderTicket } from '@/components/trade/OrderTicket'
import { Orderbook } from '@/components/trade/Orderbook'
import { PositionsTabs } from '@/components/trade/PositionsTabs'
import { useOpenMarket } from '@/components/shell/PortfolioPanel'
import type { Tab } from '@/store/workspaces'

const panel = 'rounded-[12px] bg-panel'
const stagger = (i: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, delay: i * 0.03, ease: [0.2, 0.9, 0.1, 1] as const },
})

/** Standard market workspace: chart · order book · ticket, positions underneath. */
export function TradeLayout({ tab }: { tab: Extract<Tab, { kind: 'market' }> }) {
  const openMarket = useOpenMarket()
  return (
    <div className="flex h-full gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-h-0 flex-1 gap-2">
          <motion.div {...stagger(0)} className={`${panel} min-w-0 flex-1 overflow-hidden`}>
            <ChartPanel coin={tab.coin} />
          </motion.div>
          <motion.div {...stagger(1)} className={`${panel} flex w-[272px] shrink-0 overflow-hidden max-lg:hidden`}>
            <Orderbook coin={tab.coin} className="flex-1" />
          </motion.div>
        </div>
        <motion.div {...stagger(2)} className={`${panel} h-[140px] shrink-0 overflow-hidden`}>
          <PositionsTabs className="h-full" />
        </motion.div>
      </div>
      <motion.div {...stagger(3)} className={`${panel} flex w-[272px] shrink-0 flex-col justify-between overflow-y-auto no-scrollbar`}>
        <OrderTicket coin={tab.coin} onCoinChange={(c) => openMarket(c)} />
        <AccountSummary />
      </motion.div>
    </div>
  )
}
