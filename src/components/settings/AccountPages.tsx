import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Eye, ExternalLink, KeyRound, LogOut, Plus, Repeat, Trash2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { erc20Abi, formatUnits, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { useBalance, useDisconnect, useReadContract, useSwitchChain, useAccount as useWagmiAccount, useWalletClient } from 'wagmi'
import { arbitrum } from 'wagmi/chains'
import { TransferDialog } from '@/components/trade/AccountSummary'
import { fmtUsd, shortAddr, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { enableTrading, forgetTradingKey, useAccount } from '@/store/account'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { ARB_USDC } from '@/wallet/config'
import { Button, CopyButton, DangerButton, Group, Notice, Page, Row } from './controls'

const explorer = (a: string) => `https://app.hyperliquid.xyz/explorer/address/${a}`

export function Avatar({ address, className }: { address: string; className?: string }) {
  // Deterministic gradient per address so saved accounts are easy to tell apart.
  const h = parseInt(address.slice(2, 8), 16) % 360
  return (
    <span
      className={cn('block size-8 shrink-0 rounded-[9px] ring-1 ring-white/10', className)}
      style={{ background: `conic-gradient(from ${h}deg, hsl(${h} 80% 60%), hsl(${(h + 90) % 360} 80% 55%), hsl(${(h + 200) % 360} 75% 55%), hsl(${h} 80% 60%))` }}
    />
  )
}

export function WalletPage() {
  const { address, connector, chainId, isConnected } = useWagmiAccount()
  const { disconnect } = useDisconnect()
  const { openConnectModal } = useConnectModal()
  const { switchChain } = useSwitchChain()
  const { data: wallet } = useWalletClient()
  const watching = useUI((s) => s.watching)
  const watch = useUI((s) => s.watch)
  const openSettings = useUI((s) => s.openSettings)
  const acct = useAccount()
  // RainbowKit's modal renders outside this dialog, and Radix blocks pointer events outside
  // an open modal, so close settings first and open the wallet picker once it's gone.
  const connect = () => {
    openSettings(false)
    setTimeout(() => openConnectModal?.(), 150)
  }
  const [transfer, setTransfer] = useState<'deposit' | 'withdraw' | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: usdc } = useReadContract({
    address: ARB_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arbitrum.id,
    query: { enabled: !!address },
  })
  const { data: eth } = useBalance({ address, chainId: arbitrum.id, query: { enabled: !!address } })

  const own = !acct.readOnly && acct.address === address
  const agent = own && acct.agentKey ? privateKeyToAccount(acct.agentKey).address : undefined

  const enable = async () => {
    if (!wallet) return toast.error('Wallet not ready')
    setBusy(true)
    try {
      toast.loading('Approve Impulse trading key in your wallet…', { id: 'agent' })
      await enableTrading(wallet)
      toast.success('Trading enabled', { id: 'agent', description: 'Orders are now signed locally without wallet popups.' })
    } catch (e) {
      toast.error('Could not enable trading', { id: 'agent', description: e instanceof Error ? e.message.split('\n')[0] : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Wallet" description="The wallet you trade with. Impulse is non-custodial: funds stay in your Hyperliquid account and every action is signed by you.">
      {watching && (
        <Notice>
          <div className="flex items-center justify-between gap-3">
            <span>
              You're viewing <span className="num">{shortAddr(watching)}</span> in read-only mode.
            </span>
            <Button onClick={() => watch(undefined)}>Back to my wallet</Button>
          </div>
        </Notice>
      )}

      {!isConnected || !address ? (
        <Group>
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-chip text-fg-2">
              <Wallet className="size-5" />
            </span>
            <div>
              <div className="text-[13px] text-fg">No wallet connected</div>
              <div className="mt-1 text-[12px] text-fg-3">Connect a wallet on Arbitrum to trade, deposit and withdraw.</div>
            </div>
            <Button tone="primary" onClick={connect}>
              Connect wallet
            </Button>
          </div>
        </Group>
      ) : (
        <>
          <Group title="Connected">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <Avatar address={address} />
              <div className="min-w-0 flex-1">
                <div className="num flex items-center gap-2 text-[13px] text-fg">
                  {shortAddr(address)}
                  <CopyButton text={address} />
                  <a href={explorer(address)} target="_blank" rel="noreferrer" className="text-fg-2 hover:text-fg" aria-label="Open in explorer">
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
                <div className="mt-0.5 text-[11.5px] text-fg-3">
                  {connector?.name ?? 'Wallet'} · {chainId === arbitrum.id ? 'Arbitrum' : 'Wrong network'}
                </div>
              </div>
              {chainId !== arbitrum.id && <Button onClick={() => switchChain({ chainId: arbitrum.id })}>Switch to Arbitrum</Button>}
            </div>
            <Row label="Change wallet" hint="Disconnect and pick another wallet or account.">
              <Button onClick={() => (disconnect(), connect())}>
                <Repeat className="size-3.5" /> Switch
              </Button>
              <Button tone="danger" onClick={() => disconnect()}>
                <LogOut className="size-3.5" /> Disconnect
              </Button>
            </Row>
          </Group>

          <Group
            title="Balances"
            aside={
              <div className="flex gap-1.5">
                <Button disabled={!own} onClick={() => setTransfer('deposit')}>
                  Deposit
                </Button>
                <Button disabled={!own} onClick={() => setTransfer('withdraw')}>
                  Withdraw
                </Button>
              </div>
            }
          >
            <Row label="Hyperliquid account value" hint="Perps plus spot USDC.">
              <span className="num text-[12.5px] text-fg">{own ? fmtUsd(acct.portfolioValue) : '—'}</span>
            </Row>
            <Row label="Withdrawable">
              <span className="num text-[12.5px] text-fg">{own ? fmtUsd(acct.withdrawable) : '—'}</span>
            </Row>
            <Row label="24h PNL">
              <span className={cn('num text-[12.5px]', own ? tone(acct.pnl24h) : 'text-fg')}>{own ? fmtUsd(acct.pnl24h) : '—'}</span>
            </Row>
            <Row label="USDC on Arbitrum" hint="Available to deposit.">
              <span className="num text-[12.5px] text-fg">{usdc != null ? fmtUsd(Number(formatUnits(usdc, 6))) : '—'}</span>
            </Row>
            <Row label="ETH on Arbitrum" hint="Pays gas for deposits.">
              <span className="num text-[12.5px] text-fg">{eth ? `${Number(formatUnits(eth.value, eth.decimals)).toFixed(5)} ETH` : '—'}</span>
            </Row>
          </Group>

          <Group title="Trading key">
            <Row
              label={
                <span className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-fg-2" />
                  {agent ? 'Enabled' : 'Not enabled'}
                  {agent && <span className="rounded bg-up-soft px-1 text-[10.5px] text-up">active</span>}
                </span>
              }
              hint={
                agent ? (
                  <span className="num">Key {shortAddr(agent)} signs orders in this browser without wallet popups.</span>
                ) : (
                  'Approve a local key once so orders don’t need a wallet popup each time. It can trade but never withdraw.'
                )
              }
            >
              {agent ? (
                <DangerButton onConfirm={() => (forgetTradingKey(), toast.success('Trading key removed from this browser'))}>Forget key</DangerButton>
              ) : (
                <Button tone="primary" disabled={!own || busy} onClick={enable}>
                  {busy ? 'Waiting…' : 'Enable trading'}
                </Button>
              )}
            </Row>
          </Group>
        </>
      )}
      <TransferDialog mode={transfer} onClose={() => setTransfer(null)} />
    </Page>
  )
}

export function AccountsPage() {
  const watched = usePrefs((s) => s.watched)
  const setPrefs = usePrefs((s) => s.set)
  const { address } = useWagmiAccount()
  const watching = useUI((s) => s.watching)
  const watch = useUI((s) => s.watch)
  const [addr, setAddr] = useState('')
  const [label, setLabel] = useState('')

  const valid = isAddress(addr.trim())
  const dupe = watched.some((w) => w.address.toLowerCase() === addr.trim().toLowerCase())

  const add = () => {
    if (!valid || dupe) return
    const a = addr.trim() as `0x${string}`
    setPrefs({ watched: [...watched, { address: a, label: label.trim() || shortAddr(a) }] })
    setAddr('')
    setLabel('')
  }

  const view = (a?: `0x${string}`) => {
    watch(a)
    toast.success(a ? `Viewing ${shortAddr(a)} (read only)` : 'Back to your wallet')
  }

  return (
    <Page
      title="Accounts"
      description="Save other Hyperliquid addresses (a second wallet, a vault, a trader you follow) and switch the portfolio, positions and history to them in read-only mode."
    >
      <Group title="Your wallet">
        {address ? (
          <AccountRow address={address} label="Connected wallet" active={!watching} onView={() => view(undefined)} />
        ) : (
          <Row label="No wallet connected" hint="Connect one under Wallet." />
        )}
      </Group>

      <Group title={`Watched (${watched.length})`}>
        {watched.length === 0 && <Row label="No watched accounts yet" hint="Add one below. Watched accounts can't place orders." />}
        {watched.map((w) => (
          <AccountRow
            key={w.address}
            address={w.address}
            label={w.label}
            active={watching?.toLowerCase() === w.address.toLowerCase()}
            onView={() => view(w.address)}
            onRename={(l) => setPrefs({ watched: watched.map((x) => (x.address === w.address ? { ...x, label: l || shortAddr(x.address) } : x)) })}
            onRemove={() => {
              if (watching?.toLowerCase() === w.address.toLowerCase()) watch(undefined)
              setPrefs({ watched: watched.filter((x) => x.address !== w.address) })
            }}
          />
        ))}
      </Group>

      <Group title="Add account">
        <div className="flex flex-col gap-2 p-3">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="0x… address"
            className="num h-8 rounded-[8px] bg-field px-2.5 text-[12px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
          />
          <div className="flex gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Label (optional)"
              className="h-8 flex-1 rounded-[8px] bg-field px-2.5 text-[12.5px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
            />
            <Button tone="primary" disabled={!valid || dupe} onClick={add}>
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
          {addr && !valid && <span className="text-[11.5px] text-[#ff9aa9]">Not a valid address</span>}
          {dupe && <span className="text-[11.5px] text-fg-3">Already watched</span>}
        </div>
      </Group>
    </Page>
  )
}

function AccountRow({
  address,
  label,
  active,
  onView,
  onRename,
  onRemove,
}: {
  address: `0x${string}`
  label: string
  active: boolean
  onView: () => void
  onRename?: (l: string) => void
  onRemove?: () => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <Avatar address={address} className="size-7" />
      <div className="min-w-0 flex-1">
        {editing && onRename ? (
          <input
            autoFocus
            defaultValue={label}
            onBlur={(e) => (onRename(e.target.value.trim()), setEditing(false))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-6 w-full rounded-[6px] bg-field px-1.5 text-[12.5px] text-fg ring-1 ring-line outline-none"
          />
        ) : (
          <button onClick={() => onRename && setEditing(true)} className={cn('block truncate text-left text-[12.5px] text-fg', onRename && 'hover:underline')} title={onRename ? 'Rename' : undefined}>
            {label}
          </button>
        )}
        <div className="num flex items-center gap-2 text-[11.5px] text-fg-3">
          {shortAddr(address)}
          <CopyButton text={address} />
          <a href={explorer(address)} target="_blank" rel="noreferrer" className="hover:text-fg" aria-label="Open in explorer">
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
      {active ? (
        <span className="rounded-[6px] bg-brand-soft px-2 py-1 text-[11px] text-brand">Viewing</span>
      ) : (
        <Button onClick={onView}>
          <Eye className="size-3.5" /> View
        </Button>
      )}
      {onRemove && (
        <button onClick={onRemove} className="grid size-7 place-items-center rounded-[7px] text-fg-3 hover:bg-hover hover:text-[#ff9aa9]" aria-label="Remove">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  )
}
