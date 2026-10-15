import { create } from 'zustand'
import { catalogFor, type AssetClass } from '@/lib/catalog'
import { DEXES, iconUrl, info, subs, symbolOf, type Dex } from '@/lib/hl'

export interface Market {
  coin: string
  dex: Dex
  symbol: string
  name: string
  icon: string
  assetClass: AssetClass
  industries: string[]
  region?: string
  description?: string
  /** Order-placement asset id (HIP-3 markets use 100000 + dexIndex * 10000 + i). */
  assetId: number
  szDecimals: number
  maxLeverage: number
  onlyIsolated: boolean
  markPx: number
  midPx: number
  oraclePx: number
  prevDayPx: number
  change: number
  changePct: number
  dayNtlVlm: number
  /** Open interest in USD notional. */
  openInterest: number
  /** Hourly funding rate. */
  funding: number
}

interface PerpCtx {
  funding: string
  openInterest: string
  prevDayPx: string
  dayNtlVlm: string
  markPx: string
  midPx: string | null
  oraclePx: string
}

interface MarketsState {
  markets: Record<string, Market>
  order: string[]
  loaded: boolean
  error?: string
  start: () => Promise<void>
}

const universes: Partial<Record<Dex, string[]>> = {}

function applyCtx(m: Market, c: PerpCtx): Market {
  const markPx = +c.markPx
  const prevDayPx = +c.prevDayPx
  const change = markPx - prevDayPx
  return {
    ...m,
    markPx,
    midPx: c.midPx ? +c.midPx : markPx,
    oraclePx: +c.oraclePx,
    prevDayPx,
    change,
    changePct: prevDayPx ? (change / prevDayPx) * 100 : 0,
    dayNtlVlm: +c.dayNtlVlm,
    openInterest: +c.openInterest * markPx,
    funding: +c.funding,
  }
}

/** How often live market numbers reach the UI. */
const FLUSH_MS = 250

const sameCtx = (m: Market, c: PerpCtx) =>
  m.markPx === +c.markPx && m.oraclePx === +c.oraclePx && m.funding === +c.funding && m.dayNtlVlm === +c.dayNtlVlm && m.prevDayPx === +c.prevDayPx && m.openInterest === +c.openInterest * +c.markPx && m.midPx === (c.midPx ? +c.midPx : +c.markPx)

let started = false
let retries = 0

/** Resolves once the market list has loaded (UI tools need it to resolve names). */
export function marketsReady(timeoutMs = 20_000) {
  return new Promise<void>((resolve, reject) => {
    if (useMarkets.getState().loaded) return resolve()
    const t = setTimeout(() => (unsub(), reject(new Error('Market data is still loading; try again in a moment.'))), timeoutMs)
    const unsub = useMarkets.subscribe((s) => s.loaded && (clearTimeout(t), unsub(), resolve()))
  })
}

export const useMarkets = create<MarketsState>((set, get) => ({
  markets: {},
  order: [],
  loaded: false,
  async start() {
    if (started) return
    started = true
    try {
      const perpDexs = await info.perpDexs()
      const dexIndex = (dex: Dex) => (dex === '' ? 0 : perpDexs.findIndex((d) => d?.name === dex))
      const results = await Promise.all(DEXES.map((dex) => info.metaAndAssetCtxs(dex ? { dex } : {})))
      const markets: Record<string, Market> = {}
      results.forEach(([meta, ctxs], di) => {
        const dex = DEXES[di]
        const base = dex === '' ? 0 : 100000 + dexIndex(dex) * 10000
        universes[dex] = meta.universe.map((u) => u.name)
        meta.universe.forEach((u, i) => {
          if (u.isDelisted) return
          const cat = catalogFor(u.name)
          const m: Market = {
            coin: u.name,
            dex,
            symbol: symbolOf(u.name),
            name: cat.name,
            icon: iconUrl(u.name),
            assetClass: cat.assetClass,
            industries: cat.industries ?? [],
            region: cat.region,
            description: cat.description,
            assetId: base + i,
            szDecimals: u.szDecimals,
            maxLeverage: u.maxLeverage,
            onlyIsolated: !!u.onlyIsolated || dex !== '',
            markPx: 0,
            midPx: 0,
            oraclePx: 0,
            prevDayPx: 0,
            change: 0,
            changePct: 0,
            dayNtlVlm: 0,
            openInterest: 0,
            funding: 0,
          }
          markets[u.name] = applyCtx(m, ctxs[i] as PerpCtx)
        })
      })
      const order = Object.values(markets)
        .sort((a, b) => b.dayNtlVlm - a.dayNtlVlm)
        .map((m) => m.coin)
      set({ markets, order, loaded: true })

      // The ctx feed fires several times a second per dex. Buffer it and flush at most every FLUSH_MS,
      // replacing only markets whose numbers moved, so subscribers re-render a few times a second instead of per message.
      const pending = new Map<string, PerpCtx>()
      let timer: ReturnType<typeof setTimeout> | undefined
      const flush = () => {
        timer = undefined
        const cur = get().markets
        let next: Record<string, Market> | undefined
        for (const [coin, c] of pending) {
          const m = cur[coin]
          if (!m || sameCtx(m, c)) continue
          next ??= { ...cur }
          next[coin] = applyCtx(m, c)
        }
        pending.clear()
        if (next) set({ markets: next })
      }
      for (const dex of DEXES) {
        subs.assetCtxs(dex ? { dex } : {}, (ev) => {
          const names = universes[ev.dex as Dex] ?? universes[dex]
          if (!names) return
          ev.ctxs.forEach((c, i) => names[i] && pending.set(names[i], c as PerpCtx))
          timer ??= setTimeout(flush, FLUSH_MS)
        })
      }
    } catch (e) {
      // Usually a 429 from Hyperliquid's per-IP rate limit; back off and try again.
      started = false
      retries = Math.min(retries + 1, 5)
      set({ error: e instanceof Error ? e.message : String(e) })
      setTimeout(() => void get().start(), 1000 * 2 ** retries)
    }
  },
}))

export const useMarket = (coin: string | undefined) => useMarkets((s) => (coin ? s.markets[coin] : undefined))

/** Resolve user-typed names ("crude oil", "CL", "btc") to a coin. Used by search and the AI tools. */
export function resolveCoin(query: string): string | undefined {
  const { markets } = useMarkets.getState()
  const q = query.trim().toLowerCase()
  if (!q) return
  const list = Object.values(markets)
  return (
    list.find((m) => m.coin.toLowerCase() === q || m.symbol.toLowerCase() === q)?.coin ??
    list.find((m) => m.name.toLowerCase() === q)?.coin ??
    list.find((m) => m.name.toLowerCase().includes(q))?.coin
  )
}
