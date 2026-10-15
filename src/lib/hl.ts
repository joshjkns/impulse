import { HttpTransport, InfoClient, SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid'

/** Shared Hyperliquid clients. Main perps live on dex "", HIP-3 builder markets (equities, commodities…) on "xyz". */
export const httpTransport = new HttpTransport()
export const info = new InfoClient({ transport: httpTransport })
export const wsTransport = new WebSocketTransport()
export const subs = new SubscriptionClient({ transport: wsTransport })

export const DEXES = ['', 'xyz'] as const
export type Dex = (typeof DEXES)[number]

export const iconUrl = (coin: string) => `https://app.hyperliquid.xyz/coins/${coin}.svg`

export const dexOf = (coin: string): Dex => (coin.includes(':') ? (coin.split(':')[0] as Dex) : '')
export const symbolOf = (coin: string) => (coin.includes(':') ? coin.split(':')[1] : coin)

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
}

export interface Candle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export async function fetchCandles(coin: string, interval: CandleInterval, lookbackMs: number): Promise<Candle[]> {
  const endTime = Date.now()
  const rows = await info.candleSnapshot({ coin, interval, startTime: endTime - lookbackMs, endTime })
  return rows.map((r) => ({ t: r.t, o: +r.o, h: +r.h, l: +r.l, c: +r.c, v: +r.v }))
}

export async function fetchFunding(coin: string, lookbackMs: number) {
  const rows = await info.fundingHistory({ coin, startTime: Date.now() - lookbackMs })
  return rows.map((r) => ({ t: r.time, rate: +r.fundingRate }))
}
