import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Gauge } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { useAccount as useWagmiAccount, useReadContract, useSwitchChain, useWalletClient, useWriteContract } from 'wagmi'
import { arbitrum } from 'wagmi/chains'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { fmtUsd, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAccount, withdraw } from '@/store/account'
import { ARB_USDC, HL_BRIDGE } from '@/wallet/config'

export function AccountSummary() {
  const a = useAccount()
  const [dialog, setDialog] = useState<'deposit' | 'withdraw' | null>(null)
  const { openConnectModal } = useConnectModal()
  const ratio = a.portfolioValue ? (a.maintenanceMargin / a.portfolioValue) * 100 : 0
  const leverage = a.portfolioValue ? a.totalNtl / a.portfolioValue : 0
  return (
    <div className="p-3 pt-2">
      <h3 className="mb-2 text-[13px] text-fg">Account Summary</h3>
      <div className="space-y-[7px] text-[12px]">
        <Row k="Unified Account Ratio" v={<span className="flex items-center gap-1 text-up"><Gauge className="size-3.5" />{ratio.toFixed(2)}%</span>} />
        <Row k="Portfolio Value" v={fmtUsd(a.portfolioValue)} plain />
        <Row k="Unrealized PNL" v={<span className={tone(a.unrealizedPnl)}>{fmtUsd(a.unrealizedPnl)}</span>} />
        <Row k="Perps Maintenance Margin" v={fmtUsd(a.maintenanceMargin)} />
        <Row k="Unified Account Leverage" v={`${leverage.toFixed(2)}x`} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => (a.address ? setDialog('deposit') : openConnectModal?.())} className="h-[38px] rounded-[10px] bg-chip/80 text-[13px] text-fg transition-colors hover:bg-[#35353a] active:scale-[0.985]">
          Deposit
        </button>
        <button onClick={() => (a.address ? setDialog('withdraw') : openConnectModal?.())} className="h-[38px] rounded-[10px] bg-chip/80 text-[13px] text-fg transition-colors hover:bg-[#35353a] active:scale-[0.985]">
          Withdraw
        </button>
      </div>
      <TransferDialog mode={dialog} onClose={() => setDialog(null)} />
    </div>
  )
}

function Row({ k, v, plain }: { k: string; v: React.ReactNode; plain?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn('text-fg-2', !plain && 'dotted-underline')}>{k}</span>
      <span className="num text-fg">{v}</span>
    </div>
  )
}

export function TransferDialog({ mode, onClose }: { mode: 'deposit' | 'withdraw' | null; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const { address, chainId } = useWagmiAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { data: wallet } = useWalletClient()
  const withdrawable = useAccount((s) => s.withdrawable)
  const { data: bal } = useReadContract({
    address: ARB_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arbitrum.id,
    query: { enabled: !!address && mode === 'deposit' },
  })
  const arbUsdc = bal != null ? Number(formatUnits(bal, 6)) : 0
  // Hyperliquid takes the $1 withdrawal fee out of the amount sent, so the whole balance is withdrawable.
  const max = mode === 'deposit' ? arbUsdc : Math.max(0, Math.floor(withdrawable * 100) / 100)
  const n = Number(amount) || 0
  const minimum = mode === 'deposit' ? 5 : 2

  const submit = async () => {
    setBusy(true)
    try {
      if (mode === 'deposit') {
        if (chainId !== arbitrum.id) await switchChainAsync({ chainId: arbitrum.id })
        await writeContractAsync({ address: ARB_USDC, abi: erc20Abi, functionName: 'transfer', args: [HL_BRIDGE, parseUnits(n.toFixed(6), 6)], chainId: arbitrum.id })
        toast.success('Deposit sent', { description: `${fmtUsd(n)} USDC arrives on Hyperliquid in about a minute.` })
      } else {
        if (!wallet) throw new Error('Wallet not ready')
        if (chainId !== arbitrum.id) await switchChainAsync({ chainId: arbitrum.id })
        await withdraw(wallet, n)
        toast.success('Withdrawal requested', { description: `${fmtUsd(n - 1)} USDC to Arbitrum after the $1 fee.` })
      }
      setAmount('')
      onClose()
    } catch (e) {
      toast.error(`${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} failed`, { description: e instanceof Error ? e.message.split('\n')[0] : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!mode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}</DialogTitle>
          <DialogDescription>
            {mode === 'deposit'
              ? 'Send native USDC from Arbitrum to your Hyperliquid account through the official bridge. Minimum 5 USDC.'
              : 'Withdraw USDC from Hyperliquid to the same address on Arbitrum. Hyperliquid charges a $1 fee.'}
          </DialogDescription>
        </DialogHeader>
        <label className="flex h-11 items-center gap-2 rounded-[10px] bg-field px-3 ring-1 ring-line">
          <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" className="num flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3" />
          <button onClick={() => setAmount(max.toFixed(2))} className="text-[12px] text-brand">
            Max
          </button>
          <span className="text-[12px] text-fg-2">USDC</span>
        </label>
        <div className="num -mt-1 flex justify-between text-[11.5px] text-fg-2">
          <span>Available: {fmtUsd(max)}</span>
          {mode === 'withdraw' && n > 0 && <span>You receive: {fmtUsd(Math.max(0, n - 1))}</span>}
        </div>
        <button
          disabled={busy || n < minimum || n > max + 1e-9}
          onClick={submit}
          className="h-10 rounded-[10px] bg-fg text-[13px] font-medium text-[#111113] transition-opacity disabled:opacity-40"
        >
          {busy ? 'Confirm in wallet…' : mode === 'deposit' ? 'Deposit' : 'Withdraw'}
        </button>
      </DialogContent>
    </Dialog>
  )
}
