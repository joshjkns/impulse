import { ConnectButton } from '@rainbow-me/rainbowkit'
import { NavLink, useLocation } from 'react-router'
import { LogoMark } from '@/components/brand/Logo'
import { Kbd } from '@/components/common'
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
    <header className="app-titlebar flex h-11 shrink-0 items-center gap-6 pr-3 pl-4">
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
        <AccountButton />
      </div>
    </header>
  )
}

function AccountButton() {
  return (
    <ConnectButton.Custom>
      {({ account, mounted, openConnectModal, openAccountModal }) => {
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
            onClick={openAccountModal}
            className="size-[30px] overflow-hidden rounded-[9px] ring-1 ring-white/10 transition-transform active:scale-95"
            title={account.displayName}
          >
            {account.ensAvatar ? (
              <img src={account.ensAvatar} alt="" className="size-full object-cover" />
            ) : (
              <span
                className="block size-full"
                style={{ background: `conic-gradient(from 200deg, #f5a524, #f0405a, #9f7cf5, #2e84f5, #f5a524)` }}
              />
            )}
          </button>
        )
      }}
    </ConnectButton.Custom>
  )
}
