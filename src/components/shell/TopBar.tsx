import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Eye, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { LogoMark } from '@/components/brand/Logo'
import { Avatar } from '@/components/settings/AccountPages'
import { Kbd } from '@/components/common'
import { shortAddr } from '@/lib/format'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/workspaces', label: 'Workspaces' },
  { to: '/feed', label: 'Feed' },
]

export function TopBar() {
  const { pathname } = useLocation()
  const openCommand = useUI((s) => s.openCommand)
  return (
    <header className="flex h-11 shrink-0 items-center gap-6 pr-3 pl-4">
      <NavLink to="/" className="text-fg transition-opacity hover:opacity-80" aria-label="Impulse home">
        <LogoMark className="size-[26px]" />
      </NavLink>
      <nav className="flex items-center gap-5">
        {NAV.map((n) => {
          const active = n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)
          return (
            <NavLink
              key={n.to}
              to={n.to}
              className={cn('py-1 text-[13px] transition-colors duration-150', active ? 'text-fg' : 'text-fg-2 hover:text-fg')}
            >
              {n.label}
            </NavLink>
          )
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2.5">
        <button
          onClick={() => openCommand()}
          className="flex h-[30px] w-[196px] items-center justify-between rounded-[9px] bg-field px-3 text-[12.5px] text-fg-3 ring-1 ring-line transition-colors hover:text-fg-2 hover:ring-[#33333a]"
        >
          Search or do anything...
          <Kbd>/</Kbd>
        </button>
        <WatchingChip />
        <AccountButton />
      </div>
    </header>
  )
}

/** Shown while a watched account replaces the connected wallet. */
function WatchingChip() {
  const watching = useUI((s) => s.watching)
  const watch = useUI((s) => s.watch)
  const openSettings = useUI((s) => s.openSettings)
  const label = usePrefs((s) => s.watched.find((w) => w.address.toLowerCase() === watching?.toLowerCase())?.label)
  if (!watching) return null
  return (
    <div className="flex h-[30px] items-center rounded-[9px] bg-brand-soft text-[12px] text-brand">
      <button onClick={() => openSettings(true, 'accounts')} className="flex items-center gap-1.5 pr-1 pl-2.5" title="Read-only. Manage accounts">
        <Eye className="size-3.5" />
        <span className="max-w-[140px] truncate">{label ?? shortAddr(watching)}</span>
      </button>
      <button onClick={() => watch(undefined)} className="grid h-full w-7 place-items-center rounded-r-[9px] hover:bg-white/5" aria-label="Stop watching">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** Connect when signed out; otherwise the avatar opens Settings → Wallet. */
function AccountButton() {
  const openSettings = useUI((s) => s.openSettings)
  return (
    <ConnectButton.Custom>
      {({ account, mounted, openConnectModal }) => {
        if (!mounted) return <div className="size-[30px]" />
        if (!account)
          return (
            <button
              onClick={openConnectModal}
              className="h-[30px] rounded-[9px] bg-fg px-3 text-[12.5px] font-medium text-[#111113] transition-transform duration-150 hover:opacity-90 active:scale-[0.97]"
            >
              Connect
            </button>
          )
        return (
          <button
            onClick={() => openSettings(true, 'wallet')}
            className="size-[30px] cursor-pointer overflow-hidden rounded-[9px] transition-[transform,box-shadow] hover:ring-2 hover:ring-white/20 active:scale-95"
            title={`${account.displayName} · Wallet settings`}
            aria-label="Wallet settings"
          >
            {account.ensAvatar ? <img src={account.ensAvatar} alt="" className="size-full object-cover" /> : <Avatar address={account.address} className="size-full rounded-none ring-0" />}
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}
