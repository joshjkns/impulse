import { GripVertical } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CoinIcon, ConfirmButton } from '@/components/common'
import { fmtDateTime, fmtPct, fmtPx, fmtUsd, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { cancelOrder, closePosition, useAccount } from '@/store/account'
import { useMarkets } from '@/store/markets'

const TABS = ['Positions', 'Open orders', 'Trade history', 'Order history', 'Funding history'] as const
type TabName = (typeof TABS)[number]

export function PositionsTabs({ className }: { className?: string }) {
  const [tab, setTab] = useState<TabName>('Positions')
  const acct = useAccount()
  const markets = useMarkets((s) => s.markets)
  const sym = (c: string) => markets[c]?.symbol ?? c
  const counts: Partial<Record<TabName, number>> = { Positions: acct.positions.length, 'Open orders': acct.openOrders.length }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/[0.04] px-2 text-[12.5px]">
        <GripVertical className="size-3.5 text-fg-3" />
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('relative px-2.5 py-1 transition-colors', tab === t ? 'text-fg' : 'text-fg-2 hover:text-fg')}>
            {t}
            {!!counts[t] && <span className="num ml-1 text-fg-3">{counts[t]}</span>}
            {tab === t && <motion.span layoutId="pos-tab" className="absolute inset-x-2.5 -bottom-[7px] h-px bg-fg/60" transition={{ type: 'spring', stiffness: 700, damping: 50 }} />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto no-scrollbar">
        {!acct.address ? (
          <Empty>Connect a wallet to see your activity</Empty>
        ) : tab === 'Positions' ? (
          <Table
            cols={['Market', 'Size', 'Value', 'Entry', 'Mark', 'PNL (ROE)', 'Liq. price', 'Margin', 'Funding', '']}
            rows={acct.positions.map((p) => [
              <span className="flex items-center gap-1.5">
                <CoinIcon coin={p.coin} className="size-4" />
                {sym(p.coin)}
                <span className={cn('rounded px-1 text-[10.5px]', p.size > 0 ? 'bg-up-soft text-up' : 'bg-down-soft text-down')}>{p.leverage}x</span>
              </span>,
              <span className={p.size > 0 ? 'text-up' : 'text-down'}>{p.size}</span>,
              fmtUsd(Math.abs(p.positionValue)),
              fmtPx(p.entryPx),
              fmtPx(markets[p.coin]?.markPx),
              <span className={tone(p.unrealizedPnl)}>
                {fmtUsd(p.unrealizedPnl)} ({fmtPct(p.returnOnEquity * 100)})
              </span>,
              p.liquidationPx ? fmtPx(p.liquidationPx) : '—',
              `${fmtUsd(p.marginUsed)} ${p.isolated ? '(Isolated)' : '(Cross)'}`,
              <span className={tone(-p.funding)}>{fmtUsd(-p.funding)}</span>,
              <ConfirmButton
                disabled={acct.readOnly}
                className="rounded-md bg-chip px-2 py-0.5 text-fg hover:bg-[#35353a] disabled:opacity-40"
                onConfirm={() => closePosition(p).then(() => toast.success(`Closed ${sym(p.coin)}`), (e) => toast.error('Close failed', { description: String(e?.message ?? e) }))}
              >
                Close
              </ConfirmButton>,
            ])}
            empty="No open positions"
          />
        ) : tab === 'Open orders' ? (
          <Table
            cols={['Time', 'Market', 'Type', 'Side', 'Price', 'Size', 'Filled', '']}
            rows={acct.openOrders.map((o) => [
              fmtDateTime(o.timestamp, { second: '2-digit' }),
              sym(o.coin),
              o.orderType,
              <span className={o.side === 'B' ? 'text-up' : 'text-down'}>{o.side === 'B' ? 'Long' : 'Short'}</span>,
              fmtPx(o.limitPx),
              o.origSz,
              o.origSz - o.sz,
              <button className="rounded-md bg-chip px-2 py-0.5 text-fg hover:bg-[#35353a]" onClick={() => void cancelOrder(o.coin, o.oid)}>
                Cancel
              </button>,
            ])}
            empty="No open orders"
          />
        ) : tab === 'Trade history' ? (
          <Table
            cols={['Time', 'Market', 'Direction', 'Price', 'Size', 'Value', 'Fee', 'Closed PNL']}
            rows={acct.fills.map((f) => [
              fmtDateTime(f.time, { second: '2-digit' }),
              sym(f.coin),
              <span className={f.side === 'B' ? 'text-up' : 'text-down'}>{f.dir}</span>,
              fmtPx(f.px),
              f.sz,
              fmtUsd(f.px * f.sz),
              fmtUsd(f.fee, 4),
              <span className={tone(f.closedPnl)}>{fmtUsd(f.closedPnl)}</span>,
            ])}
            empty="No trades yet"
          />
        ) : tab === 'Order history' ? (
          <Table
            cols={['Time', 'Market', 'Type', 'Side', 'Price', 'Size']}
            rows={acct.historicalOrders.map((o) => [
              fmtDateTime(o.timestamp, { second: '2-digit' }),
              sym(o.coin),
              o.orderType,
              <span className={o.side === 'B' ? 'text-up' : 'text-down'}>{o.side === 'B' ? 'Long' : 'Short'}</span>,
              fmtPx(o.limitPx),
              o.origSz,
            ])}
            empty="No orders yet"
          />
        ) : (
          <Table
            cols={['Time', 'Market', 'Size', 'Payment', 'Rate']}
            rows={acct.funding.map((f) => [
              fmtDateTime(f.time, { second: '2-digit' }),
              sym(f.coin),
              f.szi,
              <span className={tone(f.usdc)}>{fmtUsd(f.usdc, 4)}</span>,
              fmtPct(f.fundingRate * 100, 4),
            ])}
            empty="No funding payments in the last 7 days"
          />
        )}
      </div>
    </div>
  )
}

function Table({ cols, rows, empty }: { cols: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[11px] text-fg-2">
          {cols.map((c, i) => (
            <th key={i} className="px-3 py-2 font-normal whitespace-nowrap">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-white/[0.035] hover:bg-hover/40">
            {r.map((c, j) => (
              <td key={j} className="num px-3 py-2 whitespace-nowrap text-fg">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full min-h-20 place-items-center text-[12px] text-fg-3">{children}</div>
}
