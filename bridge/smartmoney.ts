import { info } from './data.ts'

/**
 * "Smart money" = Hyperliquid accounts with ≥ $1M all-time PnL. We take the largest of them by account
 * value, poll their positions on the main and HIP-3 dexes, and aggregate long/short notional per market.
 * A rolling 24h history lets alerts ask "did smart money add $5M of shorts today?".
 */

export interface SmartMoneyCoin {
  long: number
  short: number
  traders: number
  /** Change in short / long notional versus ~24h ago (or the oldest snapshot we have). */
  shortDelta24h: number
  longDelta24h: number
}

const LEADERBOARD = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard'
const MIN_PNL = 1_000_000
const MAX_TRADERS = 100
const DEXES = ['', 'xyz']

let traders: string[] = []
let leaderboardAt = 0
const history: { at: number; agg: Map<string, { long: number; short: number; traders: number }> }[] = []
let current: Record<string, SmartMoneyCoin> = {}
const listeners = new Set<(d: Record<string, SmartMoneyCoin>) => void>()

export const smartMoney = () => current
export const onSmartMoney = (fn: (d: Record<string, SmartMoneyCoin>) => void) => (listeners.add(fn), () => listeners.delete(fn))

async function refreshLeaderboard() {
  const res = await fetch(LEADERBOARD, { signal: AbortSignal.timeout(60_000) })
  const body = (await res.json()) as {
    leaderboardRows: { ethAddress: string; accountValue: string; windowPerformances: [string, { pnl: string }][] }[]
  }
  traders = body.leaderboardRows
    .filter((r) => +(Object.fromEntries(r.windowPerformances).allTime?.pnl ?? 0) >= MIN_PNL)
    .sort((a, b) => +b.accountValue - +a.accountValue)
    .slice(0, MAX_TRADERS)
    .map((r) => r.ethAddress)
  leaderboardAt = Date.now()
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items]
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (q.length) {
        await fn(q.shift()!)
        await new Promise((r) => setTimeout(r, 350))
      }
    }),
  )
}

async function snapshot() {
  if (!traders.length || Date.now() - leaderboardAt > 6 * 3_600_000) await refreshLeaderboard()
  const agg = new Map<string, { long: number; short: number; traders: number }>()
  await pool(traders, 2, async (user) => {
    for (const dex of DEXES) {
      try {
        const s = await info.clearinghouseState(dex ? { user: user as `0x${string}`, dex } : { user: user as `0x${string}` })
        for (const { position: p } of s.assetPositions) {
          const v = Math.abs(+p.positionValue)
          const a = agg.get(p.coin) ?? { long: 0, short: 0, traders: 0 }
          if (+p.szi > 0) a.long += v
          else a.short += v
          a.traders += 1
          agg.set(p.coin, a)
        }
      } catch {
        /* skip account this round */
      }
    }
  })
  const now = Date.now()
  history.push({ at: now, agg })
  while (history.length > 2 && now - history[1].at > 24 * 3_600_000) history.shift()
  const base = history[0].agg
  const next: Record<string, SmartMoneyCoin> = {}
  for (const [coin, a] of agg) {
    const b = base.get(coin) ?? { long: 0, short: 0 }
    next[coin] = { ...a, shortDelta24h: a.short - b.short, longDelta24h: a.long - b.long }
  }
  current = next
  listeners.forEach((fn) => fn(current))
}

export function startSmartMoney(intervalMs = 10 * 60_000) {
  const run = () => snapshot().catch((e) => console.warn('[smart-money]', e instanceof Error ? e.message : e))
  void run()
  setInterval(run, intervalMs)
}
