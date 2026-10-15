import { useConnectModal } from '@rainbow-me/rainbowkit'
import { ChevronsLeft, ChevronsRight, Heart, Settings, StickyNote, Wallet } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { CoinIcon, IconButton, LivePrice } from '@/components/common'
import { fmtPct, fmtUsd, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAccount } from '@/store/account'
import { useMarkets } from '@/store/markets'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { useWorkspaces } from '@/store/workspaces'

type Tab = 'portfolio' | 'watchlist'

export function PortfolioPanel() {
  const open = usePrefs((s) => s.portfolioOpen)
  const setPrefs = usePrefs((s) => s.set)
  const [tab, setTab] = useState<Tab>('portfolio')
  const openSettings = useUI((s) => s.openSettings)

  return (
    <aside className="app-sidepanel flex h-full shrink-0">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 250, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0.9, 0.1, 1] }}
            className="overflow-hidden"
          >
            <div className="h-full w-[250px] overflow-y-auto pt-3 pr-1 pl-3 no-scrollbar">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.16 }}
                >
                  {tab === 'portfolio' ? <Portfolio /> : <Watchlist />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex w-11 flex-col items-center gap-1 py-3">
        <IconButton onClick={() => setPrefs({ portfolioOpen: !open })} aria-label="Toggle panel">
          {open ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </IconButton>
        <div className="my-auto flex flex-col gap-1">
          <RailButton active={open && tab === 'portfolio'} onClick={() => (setTab('portfolio'), setPrefs({ portfolioOpen: true }))}>
            <Wallet className="size-4" />
          </RailButton>
          <RailButton active={open && tab === 'watchlist'} onClick={() => (setTab('watchlist'), setPrefs({ portfolioOpen: true }))}>
            <Heart className="size-4" />
          </RailButton>
        </div>
        <IconButton onClick={() => openSettings()} aria-label="Settings">
          <Settings className="size-4" />
        </IconButton>
      </div>
    </aside>
  )
}

function RailButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'grid size-8 place-items-center rounded-[10px] transition-colors duration-150',
        active ? 'bg-hover text-fg' : 'text-fg-2 hover:bg-hover/60 hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function Portfolio() {
  const { address, portfolioValue, pnl24h, positions } = useAccount(
    useShallow((s) => ({ address: s.address, portfolioValue: s.portfolioValue, pnl24h: s.pnl24h, positions: s.positions })),
  )
  const markets = useMarkets((s) => s.meta)
  const { openConnectModal } = useConnectModal()
  const openMarket = useOpenMarket()

  return (
    <div>
      <h2 className="text-[15px] text-fg">My Portfolio</h2>
      <div className="num mt-1.5 text-[26px] font-medium tracking-[-0.02em] text-fg">{fmtUsd(portfolioValue)}</div>
      <div className={cn('num mt-0.5 text-[12px]', pnl24h >= 0 ? 'text-up' : 'text-down')}>
        {pnl24h >= 0 ? '+' : ''}
        {fmtUsd(pnl24h)} <span className="text-fg-2">24h</span>
      </div>
      <h3 className="mt-6 text-[13.5px] text-fg">Open Positions</h3>
      {!address ? (
        <Empty>
          <span>Connect a wallet to see positions</span>
          <button onClick={openConnectModal} className="mt-2 rounded-lg bg-chip px-3 py-1.5 text-fg transition-colors hover:bg-chip-hover">
            Connect wallet
          </button>
        </Empty>
      ) : positions.length === 0 ? (
        <Empty>No open positions</Empty>
      ) : (
        <ul className="mt-3 space-y-1">
          <AnimatePresence initial={false}>
            {positions.map((p) => {
              const m = markets[p.coin]
              return (
                <motion.li
                  key={p.coin}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => openMarket(p.coin)}
                  className="-mx-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-hover"
                >
                  <CoinIcon coin={p.coin} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-fg">{m?.symbol ?? p.coin}</span>
                      <span className={cn('rounded px-1 text-[10.5px]', p.size > 0 ? 'bg-up-soft text-up' : 'bg-down-soft text-down')}>
                        {p.size > 0 ? 'Long' : 'Short'} {p.leverage}x
                      </span>
                    </div>
                    <div className="num text-[11.5px] text-fg-2">{fmtUsd(Math.abs(p.positionValue))}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn('num', tone(p.unrealizedPnl))}>{fmtUsd(p.unrealizedPnl)}</div>
                    <div className={cn('num text-[11.5px]', tone(p.returnOnEquity))}>{fmtPct(p.returnOnEquity * 100)}</div>
                  </div>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function Watchlist() {
  const favorites = usePrefs((s) => s.favorites)
  const markets = useMarkets(useShallow((s) => Object.fromEntries(favorites.map((c) => [c, s.markets[c]]))))
  const openMarket = useOpenMarket()
  return (
    <div>
      <h2 className="text-[15px] text-fg">Watchlist</h2>
      {favorites.length === 0 && <Empty>Heart a market to watch it</Empty>}
      <ul className="mt-3 space-y-0.5">
        {favorites.map((c) => {
          const m = markets[c]
          if (!m) return null
          return (
            <li key={c} onClick={() => openMarket(c)} className="-mx-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-hover">
              <CoinIcon coin={c} />
              <span className="flex-1 truncate text-fg">{m.name}</span>
              <div className="text-right">
                <LivePrice value={m.markPx} className="block text-fg" />
                <span className={cn('num text-[11.5px]', tone(m.changePct))}>{fmtPct(m.changePct)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-14 text-center text-[11.5px] text-fg-2">
      <StickyNote className="mb-2.5 size-6 fill-fg-2/80 text-fg-2/80" strokeWidth={1.5} />
      {children}
    </div>
  )
}

export function useOpenMarket() {
  const nav = useNavigate()
  const openMarketTab = useWorkspaces((s) => s.openMarket)
  return (coin: string) => {
    const id = openMarketTab(coin)
    nav(`/workspaces/${id}`)
  }
}
