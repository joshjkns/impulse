import { ChevronDown, Search } from 'lucide-react'
import { CoinIcon } from '@/components/common'
import { useOpenMarket } from '@/components/shell/PortfolioPanel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'

/** Coin pill shared by pane headers: shows the market, lists favorites, switches the tab's market. */
export function CoinSwitcher({
  coin,
  onChange,
  className,
  children,
}: {
  coin: string
  onChange?: (coin: string) => void
  className?: string
  children?: React.ReactNode
}) {
  const favorites = usePrefs((s) => s.favorites)
  const openMarket = useOpenMarket()
  const openCommand = useUI((s) => s.openCommand)
  const pick = onChange ?? openMarket
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 rounded-[9px] bg-chip/70 px-2 text-fg-2 transition-colors hover:bg-chip hover:text-fg data-[state=open]:bg-chip',
            className,
          )}
        >
          {children ?? <CoinIcon coin={coin} className="size-4 rounded-full" />}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {favorites.map((c) => (
          <DropdownMenuItem key={c} onSelect={() => c !== coin && pick(c)}>
            <CoinIcon coin={c} className="size-4" /> {c.replace(/^xyz:/, '')}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => openCommand('>open ')} className="text-fg-2">
          <Search className="size-3.5" /> All markets…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
