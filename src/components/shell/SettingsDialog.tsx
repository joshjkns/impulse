import { Bell, Bot, Database, Monitor, Plug, SlidersHorizontal, Users, Wallet, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { AccountsPage, WalletPage } from '@/components/settings/AccountPages'
import { AgentPage, IntegrationsPage } from '@/components/settings/AgentPages'
import { DataPage, DisplayPage, NotificationsPage, TradingPage } from '@/components/settings/PreferencePages'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useUI, type SettingsPage } from '@/store/ui'

const GROUPS: { title: string; items: { id: SettingsPage; label: string; icon: LucideIcon; page: () => React.ReactNode }[] }[] = [
  {
    title: 'Account',
    items: [
      { id: 'wallet', label: 'Wallet', icon: Wallet, page: WalletPage },
      { id: 'accounts', label: 'Accounts', icon: Users, page: AccountsPage },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { id: 'trading', label: 'Trading', icon: SlidersHorizontal, page: TradingPage },
      { id: 'display', label: 'Display', icon: Monitor, page: DisplayPage },
      { id: 'notifications', label: 'Notifications', icon: Bell, page: NotificationsPage },
    ],
  },
  {
    title: 'AI',
    items: [
      { id: 'agent', label: 'AI agent', icon: Bot, page: AgentPage },
      { id: 'integrations', label: 'Integrations', icon: Plug, page: IntegrationsPage },
    ],
  },
  {
    title: 'Advanced',
    items: [{ id: 'data', label: 'Data & storage', icon: Database, page: DataPage }],
  },
]

const ITEMS = GROUPS.flatMap((g) => g.items)

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen)
  const page = useUI((s) => s.settingsPage)
  const openSettings = useUI((s) => s.openSettings)
  const current = ITEMS.find((i) => i.id === page) ?? ITEMS[0]
  const Current = current.page

  return (
    <Dialog open={open} onOpenChange={(o) => openSettings(o)}>
      <DialogContent className="flex h-[min(640px,88vh)] gap-0 overflow-hidden border-0 bg-[#18181c] p-0 ring-1 ring-white/[0.07] sm:max-w-[820px]">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">Wallet, accounts, trading, display, notifications and AI settings.</DialogDescription>

        <nav className="flex w-[200px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/[0.05] bg-black/15 p-3 max-sm:w-[64px]">
          <div className="px-2 pt-1 text-[14px] font-medium text-fg max-sm:hidden">Settings</div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1 px-2 text-[10.5px] font-medium tracking-wide text-fg-3 uppercase max-sm:hidden">{g.title}</div>
              {g.items.map((i) => (
                <button
                  key={i.id}
                  onClick={() => openSettings(true, i.id)}
                  className={cn('relative flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[12.5px] transition-colors max-sm:justify-center', page === i.id ? 'text-fg' : 'text-fg-2 hover:text-fg')}
                  title={i.label}
                >
                  {page === i.id && <motion.span layoutId="settings-nav" className="absolute inset-0 rounded-[8px] bg-white/[0.06]" transition={{ type: 'spring', stiffness: 700, damping: 50 }} />}
                  <i.icon className="relative size-4 shrink-0" />
                  <span className="relative max-sm:hidden">{i.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={current.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <Current />
            </motion.div>
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
