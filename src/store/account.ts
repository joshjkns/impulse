import { ExchangeClient } from '@nktkas/hyperliquid'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { WalletClient } from 'viem'
import { create } from 'zustand'
import { DEXES, httpTransport, info } from '@/lib/hl'
import { useMarkets, type Market } from '@/store/markets'

export interface Position {
  coin: string
  size: number
  entryPx: number
  positionValue: number
  unrealizedPnl: number
  returnOnEquity: number
  liquidationPx: number | null
  leverage: number
  isolated: boolean
  marginUsed: number
  funding: number
}

export interface OpenOrder {
  coin: string
  oid: number
  side: 'B' | 'A'
  limitPx: number
  sz: number
  origSz: number
  timestamp: number
  orderType: string
  reduceOnly: boolean
}

export interface Fill {
  coin: string
  px: number
  sz: number
  side: 'B' | 'A'
  time: number
  dir: string
  closedPnl: number
  fee: number
  oid: number
  hash: string
}

export interface FundingPayment {
  time: number
  coin: string
  usdc: number
  szi: number
  fundingRate: number
}

interface AccountState {
  address?: `0x${string}`
  agentKey?: `0x${string}`
  portfolioValue: number
  pnl24h: number
  unrealizedPnl: number
  maintenanceMargin: number
  totalNtl: number
  withdrawable: number
  positions: Position[]
  openOrders: OpenOrder[]
  fills: Fill[]
  historicalOrders: OpenOrder[]
  funding: FundingPayment[]
  /** Per-coin leverage preferences chosen in the ticket. */
  leverage: Record<string, { value: number; isolated: boolean }>
  setAddress: (a?: `0x${string}`) => void
  refresh: () => Promise<void>
  setLeverage: (coin: string, value: number, isolated: boolean) => void
}

const agentStorageKey = (addr: string) => `impulse.agent.${addr.toLowerCase()}`
const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

let poll: ReturnType<typeof setInterval> | undefined

export const useAccount = create<AccountState>((set, get) => ({
  portfolioValue: 0,
  pnl24h: 0,
  unrealizedPnl: 0,
  maintenanceMargin: 0,
  totalNtl: 0,
  withdrawable: 0,
  positions: [],
  openOrders: [],
  fills: [],
  historicalOrders: [],
  funding: [],
  leverage: {},
  setAddress(address) {
    if (address === get().address) return
    clearInterval(poll)
    set({
      address,
      agentKey: address ? ((safeGet(agentStorageKey(address)) as `0x${string}` | null) ?? undefined) : undefined,
      positions: [],
      openOrders: [],
      fills: [],
      portfolioValue: 0,
      pnl24h: 0,
    })
    if (address) {
      void get().refresh()
      poll = setInterval(() => void get().refresh(), 4000)
    }
  },
  async refresh() {
    const user = get().address
    if (!user) return
    try {
      const [states, spot, orders, fills, portfolio, funding, hist] = await Promise.all([
        Promise.all(DEXES.map((dex) => info.clearinghouseState(dex ? { user, dex } : { user }))),
        info.spotClearinghouseState({ user }),
        Promise.all(DEXES.map((dex) => info.frontendOpenOrders(dex ? { user, dex } : { user }))),
        info.userFills({ user, aggregateByTime: true }),
        info.portfolio({ user }).catch(() => undefined),
        info.userFunding({ user, startTime: Date.now() - 7 * 86_400_000 }).catch(() => []),
        info.historicalOrders({ user }).catch(() => []),
      ])
      if (get().address !== user) return
      const positions: Position[] = states.flatMap((s) =>
        s.assetPositions.map(({ position: p }) => ({
          coin: p.coin,
          size: +p.szi,
          entryPx: +p.entryPx,
          positionValue: +p.positionValue,
          unrealizedPnl: +p.unrealizedPnl,
          returnOnEquity: +p.returnOnEquity,
          liquidationPx: p.liquidationPx ? +p.liquidationPx : null,
          leverage: p.leverage.value,
          isolated: p.leverage.type === 'isolated',
          marginUsed: +p.marginUsed,
          funding: +p.cumFunding.sinceOpen,
        })),
      )
      const perpValue = states.reduce((a, s) => a + +s.marginSummary.accountValue, 0)
      const usdc = spot.balances.find((b) => b.coin === 'USDC')
      const spotUsd = usdc ? +usdc.total : 0
      const day = portfolio?.find(([k]) => k === 'day')?.[1]
      const pnlHist = day?.pnlHistory ?? []
      const pnl24h = pnlHist.length ? +pnlHist[pnlHist.length - 1][1] - +pnlHist[0][1] : 0
      const toOrder = (o: (typeof orders)[number][number]): OpenOrder => ({
        coin: o.coin,
        oid: o.oid,
        side: o.side,
        limitPx: +o.limitPx,
        sz: +o.sz,
        origSz: +o.origSz,
        timestamp: o.timestamp,
        orderType: o.orderType,
        reduceOnly: o.reduceOnly,
      })
      set({
        positions,
        portfolioValue: perpValue + spotUsd,
        pnl24h,
        unrealizedPnl: positions.reduce((a, p) => a + p.unrealizedPnl, 0),
        maintenanceMargin: states.reduce((a, s) => a + +s.crossMaintenanceMarginUsed, 0),
        totalNtl: states.reduce((a, s) => a + +s.marginSummary.totalNtlPos, 0),
        withdrawable: +states[0].withdrawable,
        openOrders: orders.flat().map(toOrder),
        historicalOrders: hist.slice(0, 100).map((h) => toOrder(h.order)),
        fills: fills.slice(0, 200).map((f) => ({
          coin: f.coin,
          px: +f.px,
          sz: +f.sz,
          side: f.side,
          time: f.time,
          dir: f.dir,
          closedPnl: +f.closedPnl,
          fee: +f.fee,
          oid: f.oid,
          hash: f.hash,
        })),
        funding: funding.map((f) => ({
          time: f.time,
          coin: f.delta.coin,
          usdc: +f.delta.usdc,
          szi: +f.delta.szi,
          fundingRate: +f.delta.fundingRate,
        })),
      })
    } catch (e) {
      console.warn('[account] refresh failed', e)
    }
  },
  setLeverage(coin, value, isolated) {
    set({ leverage: { ...get().leverage, [coin]: { value, isolated } } })
  },
}))

/* ---------------------------------------------------------------- trading */

/**
 * Hyperliquid L1 actions are signed with chainId 1337, which browser wallets refuse while on another
 * chain. Like the official UI we approve a locally generated agent key once (a user-signed action
 * the wallet *can* sign on Arbitrum) and sign orders with that key afterwards.
 */
export async function enableTrading(wallet: WalletClient) {
  const user = useAccount.getState().address
  if (!user) throw new Error('Connect a wallet first')
  const key = generatePrivateKey()
  const agent = privateKeyToAccount(key)
  const exchange = new ExchangeClient({ transport: httpTransport, wallet: wallet as never })
  await exchange.approveAgent({ agentAddress: agent.address, agentName: 'Impulse' })
  // Let HIP-3 markets (equities, commodities) share the main USDC collateral. Ignore if already on.
  await exchange.userDexAbstraction({ user, enabled: true }).catch(() => undefined)
  try {
    localStorage.setItem(agentStorageKey(user), key)
  } catch {
    /* private mode: agent lives for this session only */
  }
  useAccount.setState({ agentKey: key })
}

function agentExchange() {
  const { agentKey } = useAccount.getState()
  if (!agentKey) throw new Error('Enable trading first')
  return new ExchangeClient({ transport: httpTransport, wallet: privateKeyToAccount(agentKey) })
}

/** Round a price to Hyperliquid's tick rules: ≤5 significant figures and ≤(6 - szDecimals) decimals. */
export function roundPx(px: number, m: Pick<Market, 'szDecimals'>) {
  const maxDec = Math.max(0, 6 - m.szDecimals)
  const sig = Number(px.toPrecision(5))
  return Number(sig.toFixed(maxDec)).toString()
}

export const roundSz = (sz: number, m: Pick<Market, 'szDecimals'>) =>
  (Math.floor(sz * 10 ** m.szDecimals) / 10 ** m.szDecimals).toFixed(m.szDecimals)

export interface OrderIntent {
  coin: string
  isBuy: boolean
  /** Notional in USDC. */
  usd: number
  leverage: number
  isolated: boolean
  type: 'market' | 'limit'
  limitPx?: number
  reduceOnly?: boolean
  slippage?: number
  tp?: number
  sl?: number
}

export async function placeOrder(o: OrderIntent) {
  const m = useMarkets.getState().markets[o.coin]
  if (!m) throw new Error(`Unknown market ${o.coin}`)
  const ex = agentExchange()
  await ex.updateLeverage({ asset: m.assetId, isCross: !o.isolated, leverage: o.leverage })
  const ref = o.type === 'limit' && o.limitPx ? o.limitPx : m.midPx || m.markPx
  const slip = o.slippage ?? 0.08
  const px = o.type === 'market' ? ref * (o.isBuy ? 1 + slip : 1 - slip) : ref
  const sz = roundSz(o.usd / ref, m)
  if (+sz <= 0) throw new Error('Size too small')
  const main = {
    a: m.assetId,
    b: o.isBuy,
    p: roundPx(px, m),
    s: sz,
    r: !!o.reduceOnly,
    t: { limit: { tif: o.type === 'market' ? ('FrontendMarket' as const) : ('Gtc' as const) } },
  }
  const triggers = [
    o.tp && { a: m.assetId, b: !o.isBuy, p: roundPx(o.tp, m), s: sz, r: true, t: { trigger: { isMarket: true, triggerPx: roundPx(o.tp, m), tpsl: 'tp' as const } } },
    o.sl && { a: m.assetId, b: !o.isBuy, p: roundPx(o.sl, m), s: sz, r: true, t: { trigger: { isMarket: true, triggerPx: roundPx(o.sl, m), tpsl: 'sl' as const } } },
  ].filter(Boolean) as (typeof main)[]
  const res = await ex.order({ orders: [main, ...triggers], grouping: triggers.length ? 'normalTpsl' : 'na' })
  void useAccount.getState().refresh()
  const st = res.response.data.statuses[0]
  if (st && typeof st === 'object' && 'filled' in st) return { filled: true, avgPx: +st.filled.avgPx, sz: +st.filled.totalSz }
  return { filled: false, avgPx: ref, sz: +sz }
}

export async function cancelOrder(coin: string, oid: number) {
  const m = useMarkets.getState().markets[coin]
  if (!m) return
  await agentExchange().cancel({ cancels: [{ a: m.assetId, o: oid }] })
  void useAccount.getState().refresh()
}

export async function closePosition(p: Position) {
  return placeOrder({
    coin: p.coin,
    isBuy: p.size < 0,
    usd: Math.abs(p.positionValue),
    leverage: p.leverage,
    isolated: p.isolated,
    type: 'market',
    reduceOnly: true,
  })
}

export async function withdraw(wallet: WalletClient, amount: number) {
  const user = useAccount.getState().address
  if (!user) throw new Error('Connect a wallet first')
  const exchange = new ExchangeClient({ transport: httpTransport, wallet: wallet as never })
  await exchange.withdraw3({ destination: user, amount: amount.toFixed(2) })
  void useAccount.getState().refresh()
}
