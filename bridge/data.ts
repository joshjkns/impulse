import { HttpTransport, InfoClient } from '@nktkas/hyperliquid'
import { catalogFor } from '../src/lib/catalog.ts'

export const info = new InfoClient({ transport: new HttpTransport({ timeout: 15_000 }) })
const DEXES = ['', 'xyz']

export interface MarketRow {
  coin: string
  symbol: string
  name: string
  assetClass: string
  industries: string[]
  region?: string
  markPx: number
  oraclePx: number
  prevDayPx: number
  changePct: number
  volume24h: number
  openInterestUsd: number
  fundingHourly: number
  fundingAnnualPct: number
  maxLeverage: number
  szDecimals: number
}

let cache: { at: number; rows: Map<string, MarketRow> } | undefined
let inflight: Promise<Map<string, MarketRow>> | undefined

export async function markets(maxAgeMs = 5000): Promise<Map<string, MarketRow>> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.rows
  if (inflight) return inflight
  inflight = (async () => {
    const res = await Promise.all(DEXES.map((dex) => info.metaAndAssetCtxs(dex ? { dex } : {})))
    const rows = new Map<string, MarketRow>()
    res.forEach(([meta, ctxs]) =>
      meta.universe.forEach((u, i) => {
        if (u.isDelisted) return
        const c = ctxs[i]
        const cat = catalogFor(u.name)
        const markPx = +c.markPx
        const prev = +c.prevDayPx
        rows.set(u.name, {
          coin: u.name,
          symbol: u.name.replace(/^\w+:/, ''),
          name: cat.name,
          assetClass: cat.assetClass,
          industries: cat.industries ?? [],
          region: cat.region,
          markPx,
          oraclePx: +c.oraclePx,
          prevDayPx: prev,
          changePct: prev ? ((markPx - prev) / prev) * 100 : 0,
          volume24h: +c.dayNtlVlm,
          openInterestUsd: +c.openInterest * markPx,
          fundingHourly: +c.funding,
          fundingAnnualPct: +c.funding * 24 * 365 * 100,
          maxLeverage: u.maxLeverage,
          szDecimals: u.szDecimals,
        })
      }),
    )
    cache = { at: Date.now(), rows }
    return rows
  })().finally(() => (inflight = undefined))
  return inflight
}

export async function resolve(q: unknown): Promise<MarketRow> {
  const rows = await markets(30_000)
  const s = String(q ?? '').trim()
  const l = s.toLowerCase()
  const list = [...rows.values()]
  const hit =
    rows.get(s) ??
    rows.get(`xyz:${s.toUpperCase()}`) ??
    rows.get(s.toUpperCase()) ??
    list.find((m) => m.symbol.toLowerCase() === l) ??
    list.find((m) => m.name.toLowerCase() === l) ??
    list.find((m) => m.name.toLowerCase().includes(l)) ??
    list.find((m) => l.includes(m.name.toLowerCase()))
  if (!hit) throw new Error(`Unknown market "${s}". Use list_markets to find the id.`)
  return (await markets()).get(hit.coin) ?? hit
}

const round = (v: number, d = 4) => Number(v.toFixed(d))

export async function candles(coin: string, interval: string, lookbackHours: number) {
  const end = Date.now()
  const rows = await info.candleSnapshot({ coin, interval: interval as '1h', startTime: end - lookbackHours * 3_600_000, endTime: end })
  const bars = rows.map((r) => ({ t: r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.v }))
  if (!bars.length) return { bars: [], stats: null }
  const rets = bars.slice(1).map((b, i) => Math.log(b.c / bars[i].c))
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length)
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1))
  const perYear = (365 * 24 * 3_600_000) / ({ '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 3.6e6, '4h': 1.44e7, '1d': 8.64e7 }[interval] ?? 3.6e6)
  const step = Math.max(1, Math.ceil(bars.length / 300))
  return {
    stats: {
      first: bars[0].c,
      last: bars[bars.length - 1].c,
      returnPct: round(((bars[bars.length - 1].c - bars[0].o) / bars[0].o) * 100, 2),
      high: Math.max(...bars.map((b) => b.h)),
      low: Math.min(...bars.map((b) => b.l)),
      realisedVolAnnualPct: round(sd * Math.sqrt(perYear) * 100, 1),
      bars: bars.length,
    },
    bars: bars.filter((_, i) => i % step === 0 || i === bars.length - 1).map((b) => [new Date(b.t).toISOString().slice(0, 16), b.o, b.h, b.l, b.c, round(b.v, 2)]),
    columns: ['time', 'open', 'high', 'low', 'close', 'volume'],
  }
}

export async function orderbook(coin: string, levels: number) {
  const book = await info.l2Book({ coin })
  if (!book) throw new Error('No book')
  const [bids, asks] = book.levels
  const side = (ls: typeof bids) => ls.slice(0, levels).map((l) => ({ px: +l.px, sz: +l.sz, usd: round(+l.px * +l.sz, 0) }))
  const b = side(bids)
  const a = side(asks)
  const bidUsd = b.reduce((x, l) => x + l.usd, 0)
  const askUsd = a.reduce((x, l) => x + l.usd, 0)
  return {
    mid: b[0] && a[0] ? (b[0].px + a[0].px) / 2 : undefined,
    spreadBps: b[0] && a[0] ? round(((a[0].px - b[0].px) / b[0].px) * 1e4, 2) : undefined,
    bidDepthUsd: bidUsd,
    askDepthUsd: askUsd,
    imbalance: round((bidUsd - askUsd) / Math.max(1, bidUsd + askUsd), 3),
    bids: b,
    asks: a,
  }
}

export async function funding(coin: string, days: number) {
  const rows = await info.fundingHistory({ coin, startTime: Date.now() - days * 86_400_000 })
  const rates = rows.map((r) => +r.fundingRate)
  const avg = rates.reduce((a, b) => a + b, 0) / Math.max(1, rates.length)
  const daily: Record<string, number[]> = {}
  rows.forEach((r) => (daily[new Date(r.time).toISOString().slice(0, 10)] ??= []).push(+r.fundingRate))
  return {
    averageAnnualPct: round(avg * 24 * 365 * 100, 2),
    latestAnnualPct: round((rates[rates.length - 1] ?? 0) * 24 * 365 * 100, 2),
    daily: Object.entries(daily).map(([d, xs]) => ({ date: d, annualPct: round((xs.reduce((a, b) => a + b, 0) / xs.length) * 24 * 365 * 100, 2) })),
  }
}

export async function trades(coin: string) {
  const rows = await info.recentTrades({ coin })
  const buy = rows.filter((t) => t.side === 'B').reduce((a, t) => a + +t.px * +t.sz, 0)
  const sell = rows.filter((t) => t.side === 'A').reduce((a, t) => a + +t.px * +t.sz, 0)
  return {
    buyUsd: round(buy, 0),
    sellUsd: round(sell, 0),
    trades: rows.slice(0, 40).map((t) => ({ time: new Date(t.time).toISOString().slice(11, 19), side: t.side === 'B' ? 'buy' : 'sell', px: +t.px, sz: +t.sz })),
  }
}

export interface Headline {
  title: string
  url: string
  domain: string
  seen: string
}

/** GDELT DOC 2.0 — free, keyless global news search. */
export async function news(query: string, hours: number, limit: number): Promise<Headline[]> {
  const q = query.trim()
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(`${q} sourcelang:english`)}&mode=artlist&format=json&sort=datedesc&maxrecords=${limit}&timespan=${Math.round(hours)}h`
  const res = await fetch(url, { headers: { 'user-agent': 'impulse-terminal/1.0' }, signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  if (!text.trim().startsWith('{')) throw new Error(`News search failed: ${text.slice(0, 120)}`)
  const body = JSON.parse(text) as { articles?: { title: string; url: string; domain: string; seendate: string }[] }
  return (body.articles ?? []).map((a) => ({ title: a.title, url: a.url, domain: a.domain, seen: a.seendate }))
}
