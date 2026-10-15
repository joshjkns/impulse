import { useConnectModal } from '@rainbow-me/rainbowkit'
import { ChevronDown, GripVertical } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useWalletClient } from 'wagmi'
import { CoinIcon, LivePrice } from '@/components/common'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fmtPct, fmtPx, fmtUsd, tone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { enableTrading, placeOrder, useAccount } from '@/store/account'
import type { ProposedOrder } from '@/store/chat'
import { useMarket } from '@/store/markets'
import { usePrefs } from '@/store/prefs'
import { LeveragePanel } from './LeverageControl'
import { SegmentSlider } from './SegmentSlider'

type OrderType = 'market' | 'limit'

/** Hyperliquid isolated liquidation estimate (docs: liq = px - side·margin_avail / size / (1 - l·side)). */
function liquidationPx(px: number, notional: number, lev: number, maxLev: number, side: 1 | -1) {
  if (!px || !notional) return undefined
  const size = notional / px
  const l = 1 / (2 * maxLev)
  const avail = notional / lev - notional * l
  return px - (side * avail) / size / (1 - l * side)
}

export function OrderTicket({
  coin,
  variant = 'panel',
  initial,
  onCoinChange,
  onDone,
}: {
  coin: string
  variant?: 'panel' | 'card'
  initial?: ProposedOrder
  onCoinChange?: (coin: string) => void
  onDone?: () => void
}) {
  const m = useMarket(coin)
  const acct = useAccount()
  const favorites = usePrefs((s) => s.favorites)
  const { data: wallet } = useWalletClient()
  const { openConnectModal } = useConnectModal()

  const pref = acct.leverage[coin]
  const maxLev = m?.maxLeverage ?? 20
  const [lev, setLev] = useState(initial?.leverage ?? pref?.value ?? Math.min(6, maxLev))
  const [isolated, setIsolated] = useState(pref?.isolated ?? true)
  const [type, setType] = useState<OrderType>(initial?.type ?? 'market')
  const [side, setSide] = useState<'long' | 'short'>(initial?.side ?? 'long')
  const [size, setSize] = useState(initial ? String(Math.round(initial.usd)) : '')
  const [limitPx, setLimitPx] = useState(initial?.limitPx ? String(initial.limitPx) : '')
  const [reduceOnly, setReduceOnly] = useState(false)
  const [tpsl, setTpsl] = useState(!!(initial?.takeProfit || initial?.stopLoss))
  const [tp, setTp] = useState(initial?.takeProfit ? String(initial.takeProfit) : '')
  const [sl, setSl] = useState(initial?.stopLoss ? String(initial.stopLoss) : '')
  const [levOpen, setLevOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => setLev((l) => Math.min(l, maxLev)), [maxLev])
  useEffect(() => {
    if (m?.onlyIsolated) setIsolated(true)
  }, [m?.onlyIsolated])

  const notional = Number(size.replace(/,/g, '')) || 0
  const buyingPower = Math.max(0, acct.withdrawable) * lev
  const pct = buyingPower ? Math.min(100, (notional / buyingPower) * 100) : 0
  const px = type === 'limit' && +limitPx ? +limitPx : (m?.midPx ?? 0)
  const liq = useMemo(() => liquidationPx(px, notional, lev, maxLev, side === 'long' ? 1 : -1), [px, notional, lev, maxLev, side])
  const margin = notional / lev
  const slippage = m && notional ? Math.min(8, 0.002 + (notional / Math.max(1, m.dayNtlVlm)) * 100 * 2) : 0
  const valid = notional >= 10 && !!m && (type === 'market' || +limitPx > 0)

  const place = async () => {
    if (!acct.address) return openConnectModal?.()
    if (!m) return
    setBusy(true)
    try {
      if (!acct.agentKey) {
        if (!wallet) throw new Error('Wallet not ready')
        toast.loading('Approve Impulse trading key in your wallet…', { id: 'agent' })
        await enableTrading(wallet)
        toast.success('Trading enabled', { id: 'agent', description: 'Orders are now signed locally without wallet popups.' })
      }
      acct.setLeverage(coin, lev, isolated)
      const res = await placeOrder({
        coin,
        isBuy: side === 'long',
        usd: notional,
        leverage: lev,
        isolated,
        type,
        limitPx: type === 'limit' ? +limitPx : undefined,
        reduceOnly,
        tp: tpsl && +tp ? +tp : undefined,
        sl: tpsl && +sl ? +sl : undefined,
      })
      toast.success(`${side === 'long' ? 'Long' : 'Short'} ${m.name} ${res.filled ? 'filled' : 'placed'}`, {
        description: `${lev}× • margin ${fmtUsd(margin)} • notional ${fmtUsd(notional)}`,
      })
      onDone?.()
    } catch (e) {
      toast.error('Order failed', { id: 'agent', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const card = variant === 'card'

  return (
    <div ref={root} className={cn('relative flex flex-col', card ? 'gap-3 p-4' : 'gap-3 p-3')}>
      {card && (
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid size-[30px] place-items-center rounded-full bg-white/[0.06]">
              <CoinIcon coin={coin} className="size-4 rounded-full" />
            </span>
            <span className="text-[17px] font-medium text-fg">{m?.symbol ?? coin}</span>
            <span className="rounded-[5px] bg-brand-soft px-1.5 py-[1px] text-[12px] text-brand">{maxLev}x</span>
          </div>
          <div className="text-right">
            <LivePrice value={m?.markPx ?? 0} className="block text-[17px] font-medium text-fg" />
            <span className={cn('num text-[12px]', tone(m?.changePct))}>{fmtPct(m?.changePct)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        {!card && <GripVertical className="mt-2 size-3.5 shrink-0 text-fg-3" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-[34px] items-center gap-1 rounded-[10px] bg-chip/70 px-2.5 text-fg-2 transition-colors hover:bg-chip">
              <CoinIcon coin={coin} className="size-4 rounded-full" />
              <ChevronDown className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {favorites.map((c) => (
              <DropdownMenuItem key={c} onSelect={() => onCoinChange?.(c)}>
                <CoinIcon coin={c} className="size-4" /> {c.replace(/^xyz:/, '')}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <PillButton onClick={() => !m?.onlyIsolated && setIsolated(!isolated)} title={m?.onlyIsolated ? 'This market only supports isolated margin' : undefined}>
          {isolated ? 'Isolated' : 'Cross'}
        </PillButton>
        <PillButton onClick={() => setLevOpen(true)}>
          <span className="num">{lev}x</span>
        </PillButton>
      </div>

      <LeveragePanel
        open={levOpen}
        onClose={() => setLevOpen(false)}
        coin={coin}
        symbol={m?.symbol ?? coin}
        value={lev}
        max={maxLev}
        onConfirm={setLev}
        anchor={root}
        offsetY={card ? 64 : 50}
      />

      <div className="flex items-center justify-around py-1 text-[13px]">
        {(['market', 'limit'] as const).map((t, i) => (
          <div key={t} className="flex flex-1 items-center">
            {i > 0 && <span className="h-3 w-px bg-white/10" />}
            <button onClick={() => setType(t)} className={cn('flex-1 py-1 capitalize transition-colors', type === t ? 'text-fg' : 'text-fg-2 hover:text-fg')}>
              {t}
            </button>
          </div>
        ))}
        <span className="h-3 w-px bg-white/10" />
        <button className="flex flex-1 items-center justify-center gap-1 py-1 text-fg-2 hover:text-fg">
          Pro <ChevronDown className="size-3" />
        </button>
      </div>

      <div className="relative flex h-[40px] rounded-[12px] bg-field p-1">
        {(['long', 'short'] as const).map((s) => (
          <button key={s} onClick={() => setSide(s)} className="relative z-10 flex-1 text-[13px] capitalize">
            {side === s && (
              <motion.span
                layoutId={`side-${variant}-${coin}`}
                className={cn('absolute inset-0 rounded-[9px]', s === 'long' ? 'bg-up-soft' : 'bg-down-soft')}
                transition={{ type: 'spring', stiffness: 700, damping: 45 }}
              />
            )}
            <span className={cn('relative transition-colors duration-150', side === s ? (s === 'long' ? 'text-up' : 'text-down') : 'text-fg-2')}>
              {s}
            </span>
          </button>
        ))}
      </div>

      {type === 'limit' && (
        <Field label="Price" suffix="USD">
          <input value={limitPx} onChange={(e) => setLimitPx(e.target.value.replace(/[^\d.]/g, ''))} placeholder={fmtPx(m?.midPx)} className="num w-full bg-transparent outline-none placeholder:text-fg-3" />
        </Field>
      )}

      <Field label="Size" suffix="USDC">
        <input
          value={size}
          onChange={(e) => setSize(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="0"
          inputMode="decimal"
          className="num w-full bg-transparent outline-none placeholder:text-fg-3"
        />
      </Field>

      <SegmentSlider
        value={Math.round(pct)}
        onChange={(v) => buyingPower && setSize(String(Math.floor((buyingPower * v) / 100)))}
        label={`${Math.round(pct)}%`}
        disabled={!buyingPower}
      />

      <div className="flex items-center justify-between text-[12px]">
        <span className="text-fg-2">Slippage</span>
        <span className="dotted-underline num text-fg">
          Est: {slippage.toFixed(4)}% / Max: 8.00%
        </span>
      </div>

      {!card && (
        <div className="space-y-2 text-[12px] text-fg-2">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={reduceOnly} onCheckedChange={(v) => setReduceOnly(!!v)} className="size-3.5 rounded-[4px] border-white/20" /> Reduce only
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={tpsl} onCheckedChange={(v) => setTpsl(!!v)} className="size-3.5 rounded-[4px] border-white/20" /> TP / SL
          </label>
        </div>
      )}
      {tpsl && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Take profit" suffix="">
            <input value={tp} onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Price" className="num w-full bg-transparent outline-none placeholder:text-fg-3" />
          </Field>
          <Field label="Stop loss" suffix="">
            <input value={sl} onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Price" className="num w-full bg-transparent outline-none placeholder:text-fg-3" />
          </Field>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.985 }}
        onClick={place}
        disabled={busy || (!!acct.address && !valid)}
        className={cn(
          'h-[42px] rounded-[12px] text-[13.5px] font-medium transition-colors duration-150',
          !acct.address
            ? 'bg-fg text-[#111113]'
            : valid
              ? side === 'long'
                ? 'bg-[#1f9d4f] text-white hover:bg-[#23ad58]'
                : 'bg-[#db3048] text-white hover:bg-[#e43a52]'
              : 'bg-chip/80 text-fg-2',
          busy && 'opacity-70',
        )}
      >
        {!acct.address ? 'Connect wallet' : busy ? 'Placing…' : `Place ${side}`}
      </motion.button>

      {(card || notional > 0) && (
        <div className="space-y-2 rounded-[12px] bg-[#222124] px-3.5 py-3 text-[12.5px]">
          <Row k="Liquidation Price" v={liq ? `$${fmtPx(liq)}` : '—'} />
          <Row k="Order Value" v={fmtUsd(notional)} />
          <Row k="Margin Required" v={fmtUsd(margin)} />
        </div>
      )}
      {initial?.reason && <p className="text-[11.5px] leading-snug text-fg-2">{initial.reason}</p>}
    </div>
  )
}

function PillButton({ children, className, ...p }: React.ComponentProps<'button'>) {
  return (
    <button
      {...p}
      className={cn(
        'h-[34px] flex-1 rounded-[10px] bg-chip/80 text-[12.5px] text-fg transition-colors duration-150 hover:bg-[#35353a] active:scale-[0.985]',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Field({ label, suffix, children }: { label: string; suffix: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] text-fg-2">{label}</div>
      <label className="flex h-[40px] items-center gap-2 rounded-[10px] bg-field px-3 text-[13px] text-fg ring-1 ring-transparent transition-shadow focus-within:ring-white/10">
        {children}
        {suffix && (
          <>
            <span className="h-4 w-px bg-white/10" />
            <span className="text-[12px] text-fg-2">{suffix}</span>
          </>
        )}
      </label>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-fg-2">{k}</span>
      <span className="num text-fg">{v}</span>
    </div>
  )
}
