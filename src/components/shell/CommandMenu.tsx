import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Bell, Home, LayoutGrid, MessageSquarePlus, Rss, Settings, Sparkles, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useShallow } from 'zustand/react/shallow'
import { CoinIcon } from '@/components/common'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { fmtPct, fmtPx, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useChat } from '@/store/chat'
import { useMarkets, type Market } from '@/store/markets'
import { useUI } from '@/store/ui'
import { useOpenMarket } from './PortfolioPanel'

const NONE: Record<string, Market> = {}

/** "Search or do anything": jump to markets and pages, or hand the query to Impulse. */
export function CommandMenu() {
  const { commandOpen, commandSeed, closeCommand, setChatMode, openSettings } = useUI(
    useShallow((s) => ({ commandOpen: s.commandOpen, commandSeed: s.commandSeed, closeCommand: s.closeCommand, setChatMode: s.setChatMode, openSettings: s.openSettings })),
  )
  // Live prices only matter while the menu is open; closed, it ignores the feed entirely.
  const markets = useMarkets((s) => (commandOpen ? s.markets : NONE))
  const order = useMarkets((s) => s.order)
  const send = useChat((s) => s.send)
  const newThread = useChat((s) => s.newThread)
  const openMarket = useOpenMarket()
  const nav = useNavigate()
  const { openConnectModal } = useConnectModal()
  const [q, setQ] = useState('')
  const marketsOnly = commandSeed.startsWith('>open')

  useEffect(() => {
    if (commandOpen) setQ('')
  }, [commandOpen])

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    const all = order.map((c) => markets[c]).filter(Boolean)
    if (!t) return all.slice(0, marketsOnly ? 40 : 8)
    return all
      .filter((m) => m.symbol.toLowerCase().includes(t) || m.name.toLowerCase().includes(t))
      .sort((a, b) => Number(b.symbol.toLowerCase() === t) - Number(a.symbol.toLowerCase() === t))
      .slice(0, 30)
  }, [q, order, markets, marketsOnly])

  const run = (fn: () => void) => {
    closeCommand()
    fn()
  }

  return (
    <CommandDialog open={commandOpen} onOpenChange={(o) => !o && closeCommand()} className="max-w-[560px] border-0 bg-[#18181c] ring-1 ring-white/[0.07] sm:max-w-[560px]">
      <Command shouldFilter={false} className="bg-transparent">
        <CommandInput value={q} onValueChange={setQ} placeholder={marketsOnly ? 'Open a market…' : 'Search markets or ask Impulse anything…'} />
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No markets match. Press ↵ to ask Impulse.</CommandEmpty>
          {q.trim() && !marketsOnly && (
            <CommandGroup heading="Impulse">
              <CommandItem value={`ask ${q}`} onSelect={() => run(() => void send(q, { surface: 'modal' }))}>
                <Sparkles className="text-brand" />
                <span className="truncate">Ask Impulse: “{q}”</span>
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup heading="Markets">
            {list.map((m) => (
              <CommandItem key={m.coin} value={m.coin} onSelect={() => run(() => openMarket(m.coin))}>
                <CoinIcon coin={m.coin} className="size-4" />
                <span className="text-fg">{m.symbol}</span>
                <span className="truncate text-fg-2">{m.name}</span>
                <span className="num ml-auto text-fg">{fmtPx(m.markPx)}</span>
                <span className={cn('num w-16 text-right', tone(m.changePct))}>{fmtPct(m.changePct)}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          {!marketsOnly && (
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => run(() => nav('/'))}>
                <Home /> Home
              </CommandItem>
              <CommandItem onSelect={() => run(() => nav('/workspaces'))}>
                <LayoutGrid /> Workspaces
              </CommandItem>
              <CommandItem onSelect={() => run(() => nav('/feed'))}>
                <Rss /> Feed
              </CommandItem>
              <CommandItem onSelect={() => run(() => (newThread(), setChatMode('modal')))}>
                <MessageSquarePlus /> New chat with Impulse
              </CommandItem>
              <CommandItem onSelect={() => run(() => nav('/feed'))}>
                <Bell /> Alerts
              </CommandItem>
              <CommandItem onSelect={() => run(() => openConnectModal?.())}>
                <Wallet /> Connect wallet
              </CommandItem>
              <CommandItem onSelect={() => run(() => openSettings())}>
                <Settings /> Settings
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
