import { ChevronDown, LayoutGrid, PanelRight, Plus, Save, Settings, X } from 'lucide-react'
import { Reorder, motion } from 'motion/react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CoinIcon, LivePrice } from '@/components/common'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTradeSlots } from '@/components/workspace/TradeLayout'
import { cn } from '@/lib/utils'
import { useMarket } from '@/store/markets'
import { useUI } from '@/store/ui'
import { WIDGET_META, useWorkspaces, type Tab, type WidgetKind } from '@/store/workspaces'

const ADDABLE: WidgetKind[] = ['price_oi', 'orderbook_heatmap', 'funding', 'volume_profile', 'liquidations', 'monthly_returns', 'candles', 'orderbook', 'positions']
const LABEL: Record<string, string> = {
  price_oi: 'Price & open interest',
  orderbook_heatmap: 'Order book heatmap',
  funding: 'Funding rate',
  volume_profile: 'Volume profile',
  liquidations: 'Liquidation hours',
  monthly_returns: 'Monthly returns',
  candles: 'Chart',
  orderbook: 'Order book',
  positions: 'Positions',
}

export function TabBar() {
  const { tabs, active, reorder, close, createCustom, addWidget, duplicate, retile } = useWorkspaces()
  const nav = useNavigate()
  const openCommand = useUI((s) => s.openCommand)
  const chatMode = useUI((s) => s.chatMode)
  const setChatMode = useUI((s) => s.setChatMode)
  const openSettings = useUI((s) => s.openSettings)
  const current = tabs.find((t) => t.id === active)
  const go = (id: string) => nav(`/workspaces/${id}`)

  const onAddWidget = (kind: WidgetKind) => {
    if (!current) return
    if (current.kind === 'custom') {
      const coin = current.widgets[0]?.coin ?? 'BTC'
      addWidget(current.id, { kind, coin })
    } else {
      const sym = current.coin.replace(/^xyz:/, '')
      const id = createCustom(`${sym} workspace`)
      addWidget(id, { kind, coin: current.coin })
      go(id)
    }
  }

  return (
    <div className="flex h-[38px] shrink-0 items-center gap-1 pb-1.5">
      <Reorder.Group axis="x" values={tabs.map((t) => t.id)} onReorder={reorder} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <Reorder.Item
            key={t.id}
            value={t.id}
            layout
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.1, 1] }}
            className="min-w-0 flex-1 basis-[190px]"
            style={{ maxWidth: 196 }}
          >
            <TabButton tab={t} active={t.id === active} onClick={() => go(t.id)} onClose={() => close(t.id)} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <button onClick={() => openCommand('>open ')} className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-hover hover:text-fg" aria-label="New tab">
        <Plus className="size-4" />
      </button>
      <div className="ml-2 flex shrink-0 items-center gap-0.5 text-[12px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-fg transition-colors hover:bg-hover data-[state=open]:bg-hover">
              <Plus className="size-3.5" /> Add widget
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{current?.kind === 'market' ? 'Opens a new workspace' : 'Add to this workspace'}</DropdownMenuLabel>
            {ADDABLE.map((k) => (
              <DropdownMenuItem key={k} onSelect={() => onAddWidget(k)}>
                <LayoutGrid className="size-3.5 text-fg-2" /> {LABEL[k] ?? WIDGET_META[k].title('')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-fg transition-colors hover:bg-hover data-[state=open]:bg-hover">
              <Save className="size-3.5" /> Save <ChevronDown className="size-3 text-fg-2" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => toast.success('Workspace saved', { description: 'Layouts are saved automatically on this device.' })}>Save layout</DropdownMenuItem>
            {current?.kind === 'market' && <DropdownMenuItem onSelect={() => useTradeSlots.getState().reset()}>Reset panel positions</DropdownMenuItem>}
            {current?.kind === 'custom' && (
              <>
                <DropdownMenuItem onSelect={() => { const id = duplicate(current.id); if (id) go(id) }}>Duplicate workspace</DropdownMenuItem>
                <DropdownMenuItem disabled={current.autoLayout} onSelect={() => retile(current.id)}>Tidy layout</DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onSelect={() => {
                if (!current) return
                void navigator.clipboard.writeText(JSON.stringify(current, null, 2))
                toast.success('Copied workspace JSON')
              }}
            >
              Copy as JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => current && close(current.id)} className="text-down">
              Close tab
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button onClick={() => openSettings()} className="grid size-7 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-hover hover:text-fg" aria-label="Settings">
          <Settings className="size-3.5" />
        </button>
        <button
          onClick={() => setChatMode(chatMode === 'docked' ? 'closed' : 'docked')}
          className={cn(
            'grid size-7 place-items-center rounded-lg transition-colors hover:bg-hover hover:text-fg',
            chatMode === 'docked' ? 'bg-raised text-fg' : 'text-fg-2',
          )}
          aria-label="Toggle Impulse panel"
          title={chatMode === 'docked' ? 'Hide Impulse panel' : 'Show Impulse panel'}
        >
          <PanelRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

function TabButton({ tab, active, onClick, onClose }: { tab: Tab; active: boolean; onClick: () => void; onClose: () => void }) {
  const m = useMarket(tab.kind === 'market' ? tab.coin : undefined)
  return (
    <div
      onClick={onClick}
      onAuxClick={(e) => e.button === 1 && onClose()}
      className={cn(
        'group relative flex h-[28px] cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] transition-colors duration-150',
        active ? 'text-fg' : 'text-fg-2 hover:bg-hover/50 hover:text-fg',
      )}
    >
      {active && <motion.span layoutId="tab-active" className="absolute inset-0 rounded-[8px] bg-raised" transition={{ type: 'spring', stiffness: 700, damping: 50 }} />}
      {tab.kind === 'market' ? (
        <>
          <CoinIcon coin={tab.coin} className="relative size-[14px] rounded-[4px]" />
          <span className="relative text-fg">{m?.symbol ?? tab.coin}</span>
          <LivePrice value={m?.markPx ?? 0} className="relative truncate text-fg-2" />
        </>
      ) : (
        <span className="relative truncate text-fg">
          {tab.title} ({tab.widgets.length})
        </span>
      )}
      <button
        onClick={(e) => (e.stopPropagation(), onClose())}
        className={cn('relative ml-auto grid size-4 shrink-0 place-items-center rounded text-fg-2 hover:text-fg', active ? 'grid' : 'hidden group-hover:grid')}
        aria-label="Close tab"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
