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

/** History plus any live bars that arrived while it loaded; a live bar wins over the snapshot's copy. */
function mergeLive(history: Candle[], live: Candle[]) {
  const last = history.length ? history[history.length - 1].t : -Infinity
  const tail = live.filter((b) => b.t >= last)
  if (!tail.length) return history
  return [...history.filter((b) => b.t < tail[0].t), ...tail]
}

/**
 * Candles with optional live updates over the websocket `candle` channel. `loading` stays true until the
 * history snapshot lands (retrying if Hyperliquid rate-limits it), so charts don't fit to a couple of live bars.
 */
export function useCandles(coin: string | undefined, interval: CandleInterval, lookbackMs: number, live = false) {
  const [data, setData] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!coin) return
    let alive = true
    let unsub: (() => void) | undefined
    let retry: ReturnType<typeof setTimeout> | undefined
    // Never let a previous coin/interval's bars mix with this one's.
    setData([])
    setLoading(true)
    const load = (attempt: number) =>
      loadCandles(coin, interval, lookbackMs)
        .then((d) => {
          if (!alive) return
          setData((prev) => mergeLive(d, prev))
          setLoading(false)
        })
        .catch(() => {
          if (!alive) return
          if (attempt < 5) retry = setTimeout(() => load(attempt + 1), 2000 * 2 ** attempt)
          else setLoading(false)
        })
    load(0)
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
      clearTimeout(retry)
      unsub?.()
    }
  }, [coin, interval, lookbackMs, live])
  return { data, loading }
}
