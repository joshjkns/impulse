import { motion } from 'motion/react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import { AccountSummary } from '@/components/trade/AccountSummary'
import { ChartPanel } from '@/components/trade/ChartPanel'
import { OrderTicket } from '@/components/trade/OrderTicket'
import { Orderbook } from '@/components/trade/Orderbook'
import { PositionsTabs } from '@/components/trade/PositionsTabs'
import { useOpenMarket } from '@/components/shell/PortfolioPanel'
import { cn } from '@/lib/utils'
import type { Tab } from '@/store/workspaces'

const panel = 'h-full rounded-[12px] bg-panel'
const stagger = (i: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, delay: i * 0.03, ease: [0.2, 0.9, 0.1, 1] as const },
})

/** Splits are shared by every market tab, so a layout you like follows you between markets. */
const useSaved = (id: string) => useDefaultLayout({ id: `impulse.trade.${id}`, onlySaveAfterUserInteractions: true })

/** Standard market workspace: chart · order book · ticket, positions underneath. Every split is draggable. */
export function TradeLayout({ tab }: { tab: Extract<Tab, { kind: 'market' }> }) {
  const openMarket = useOpenMarket()
  const outer = useSaved('outer')
  const main = useSaved('main')
  const top = useSaved('top')
  return (
    <Group orientation="horizontal" className="h-full" {...outer}>
      <Panel id="main" minSize="40%">
        <Group orientation="vertical" {...main}>
          <Panel id="top" minSize="30%">
            <Group orientation="horizontal" {...top}>
              <Panel id="chart" minSize="35%">
                <motion.div {...stagger(0)} className={`${panel} overflow-hidden`}>
                  <ChartPanel coin={tab.coin} />
                </motion.div>
              </Panel>
              <Split />
              <Panel id="book" defaultSize={272} minSize={210} maxSize={460}>
                <motion.div {...stagger(1)} className={`${panel} flex overflow-hidden`}>
                  <Orderbook coin={tab.coin} className="flex-1" />
                </motion.div>
              </Panel>
            </Group>
          </Panel>
          <Split vertical />
          <Panel id="positions" defaultSize={140} minSize={92} maxSize="60%">
            <motion.div {...stagger(2)} className={`${panel} overflow-hidden`}>
              <PositionsTabs className="h-full" />
            </motion.div>
          </Panel>
        </Group>
      </Panel>
      <Split />
      <Panel id="ticket" defaultSize={272} minSize={248} maxSize={380}>
        <motion.div {...stagger(3)} className={`${panel} flex flex-col justify-between overflow-y-auto no-scrollbar`}>
          <OrderTicket coin={tab.coin} onCoinChange={(c) => openMarket(c)} />
          <AccountSummary />
        </motion.div>
      </Panel>
    </Group>
  )
}

/** 8px gutter that doubles as the drag target; a hairline appears on hover or while dragging. */
function Split({ vertical }: { vertical?: boolean }) {
  return (
    <Separator
      className={cn(
        'group relative shrink-0 outline-none',
        vertical ? 'h-2 cursor-row-resize' : 'w-2 cursor-col-resize',
      )}
    >
      <span
        className={cn(
          'absolute rounded-full bg-[#5a5a64] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[separator=active]:opacity-100',
          vertical ? 'inset-x-[calc(50%-14px)] top-[3px] h-[2px]' : 'inset-y-[calc(50%-14px)] left-[3px] w-[2px]',
        )}
      />
    </Separator>
  )
}
