import { useEffect, useState } from 'react'
import { fetchCandles, subs, type Candle, type CandleInterval } from '@/lib/hl'

const cache = new Map<string, { at: number; data: Candle[]; p?: Promise<Candle[]> }>()
const TTL = 60_000

export function loadCandles(coin: string, interval: CandleInterval, lookbackMs: number) {
  const key = `${coin}|${interval}|${lookbackMs}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.p ?? Promise.resolve(hit.data)
  const p = fetchCandles(coin, interval, lookbackMs).then((data) => {
    cache.set(key, { at: Date.now(), data })
    return data
  })
  cache.set(key, { at: Date.now(), data: hit?.data ?? [], p })
  p.catch(() => cache.delete(key))
  return p
}

/** Candles with optional live updates over the websocket `candle` channel. */
export function useCandles(coin: string | undefined, interval: CandleInterval, lookbackMs: number, live = false) {
  const [data, setData] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!coin) return
    let alive = true
    let unsub: (() => void) | undefined
    setLoading(true)
    loadCandles(coin, interval, lookbackMs)
      .then((d) => alive && (setData(d), setLoading(false)))
      .catch(() => alive && setLoading(false))
    if (live) {
      subs
        .candle({ coin, interval }, (c) => {
          if (!alive) return
          const bar: Candle = { t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v }
          setData((prev) => {
            if (!prev.length) return [bar]
            const last = prev[prev.length - 1]
            if (bar.t === last.t) return [...prev.slice(0, -1), bar]
            if (bar.t > last.t) return [...prev, bar]
            return prev
          })
        })
        .then((s) => {
          if (alive) unsub = () => void s.unsubscribe()
          else void s.unsubscribe()
        })
        .catch(() => undefined)
    }
    return () => {
      alive = false
      unsub?.()
    }
  }, [coin, interval, lookbackMs, live])
  return { data, loading }
}
