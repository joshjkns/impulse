import { AnimatePresence, motion } from 'motion/react'
import { CandleChart } from '@/components/charts/CandleChart'
import { CoinIcon, LivePrice } from '@/components/common'
import { useBridgeStore } from '@/lib/bridge'
import { fmtCompact, fmtPct, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useMarket } from '@/store/markets'

export function MarketSummary({ coin }: { coin: string }) {
  const m = useMarket(coin)
  return (
    <div className="h-full w-[316px] overflow-y-auto px-3.5 pt-1 pb-4 no-scrollbar">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={coin}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.14, ease: [0.2, 0.9, 0.1, 1] }}
        >
          <div className="flex items-center gap-2.5">
            <CoinIcon coin={coin} className="size-[30px] rounded-[8px]" />
            <div>
              <div className="text-[13px] text-fg">{m?.name ?? coin}</div>
              <div className="flex items-baseline gap-1.5 text-[12.5px]">
                <span className="text-fg">
                  $<LivePrice value={m?.markPx ?? 0} />
                </span>
                <span className={cn('num text-[11px]', tone(m?.changePct))}>{fmtPct(m?.changePct)}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-[10.5px] text-fg-2">15m · {m?.dex ? 'trade.xyz on Hyperliquid' : 'Hyperliquid'}</div>
          <div className="mt-1 h-[176px]">
            <CandleChart coin={coin} interval="15m" bars={96} live />
          </div>
          <SmartMoney coin={coin} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
            <Stat label="Volume" value={fmtCompact(m?.dayNtlVlm)} />
            <Stat label="Open interest" value={fmtCompact(m?.openInterest)} />
            <Stat label="Funding / 1h" value={fmtPct((m?.funding ?? 0) * 100, 4)} tone={tone(m?.funding)} />
          </div>
          {m?.description && <p className="mt-4 text-[11.5px] leading-[1.55] text-fg">{m.description}</p>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-raised px-2 py-1.5">
      <div className="text-fg-3">{label}</div>
      <div className={cn('num mt-0.5 text-fg', tone)}>{value}</div>
    </div>
  )
}

/** Long/short split of traders with $1M+ all-time PnL, computed by the local bridge. */
export function SmartMoney({ coin }: { coin: string }) {
  const sm = useBridgeStore((s) => s.smartMoney[coin])
  const connected = useBridgeStore((s) => s.connected)
  const long = sm ? (sm.long / Math.max(1, sm.long + sm.short)) * 100 : 50
  return (
    <div className="mt-4">
      <div className="text-[12.5px] text-fg">Smart Money</div>
      {sm && sm.long + sm.short > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-[10.5px]">
          <span className="num shrink-0 text-up">{long.toFixed(0)}% long</span>
          <div className="relative flex h-[5px] flex-1 overflow-hidden rounded-full">
            <motion.div className="h-full bg-up" initial={{ width: '50%' }} animate={{ width: `${long}%` }} transition={{ duration: 0.4, ease: [0.2, 0.9, 0.1, 1] }} />
            <div className="h-full w-[3px] bg-panel" />
            <div className="h-full flex-1 bg-down" />
          </div>
          <span className="num shrink-0 text-down">{(100 - long).toFixed(0)}% short</span>
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-fg-3">
          {connected ? (sm ? 'No $1M+ traders positioned' : 'Scanning top traders…') : 'Run the Impulse bridge to track smart money'}
        </div>
      )}
      {sm && sm.traders > 0 && (
        <div className="num mt-1 text-[10.5px] text-fg-3">
          {sm.traders} traders · {fmtCompact(sm.long)} long · {fmtCompact(sm.short)} short
        </div>
      )}
    </div>
  )
}
