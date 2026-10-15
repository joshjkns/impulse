import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { markets } from './data.ts'

/**
 * Hyperliquid exposes current open interest but no history, so the bridge samples it every 10 minutes
 * and keeps an hourly series per market for 30 days. Widgets read it from GET /oi?coin=…
 */
const HOUR = 3_600_000
const KEEP = 30 * 24

let series: Record<string, [number, number][]> = {}
let file = ''

export function startOiRecorder(dir: string) {
  file = path.join(dir, 'oi.json')
  if (existsSync(file)) {
    try {
      series = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      series = {}
    }
  }
  const sample = async () => {
    try {
      const rows = await markets()
      const bucket = Math.floor(Date.now() / HOUR) * HOUR
      for (const m of rows.values()) {
        const s = (series[m.coin] ??= [])
        const last = s[s.length - 1]
        if (last && last[0] === bucket) last[1] = Math.round(m.openInterestUsd)
        else s.push([bucket, Math.round(m.openInterestUsd)])
        if (s.length > KEEP) s.splice(0, s.length - KEEP)
      }
      writeFileSync(file, JSON.stringify(series))
    } catch (e) {
      console.warn('[oi]', e instanceof Error ? e.message : e)
    }
  }
  void sample()
  setInterval(sample, 10 * 60_000)
}

export const oiSeries = (coin: string) => series[coin] ?? []
