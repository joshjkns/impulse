import { usePrefs } from '@/store/prefs'

/** Number formatting tuned to how the terminal displays prices (5 significant figures, Hyperliquid style). */

/*
 * `toLocaleString(locale, opts)` builds a fresh Intl.NumberFormat on every call, which is slow enough to show up
 * when hundreds of prices re-render a few times a second. Formatters are cached per option set instead.
 */
const numFmts = new Map<string, Intl.NumberFormat>()
export function numberFormat(min: number, max = min, grouping = true) {
  const key = `${min}|${max}|${grouping}`
  let f = numFmts.get(key)
  if (!f) numFmts.set(key, (f = new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping })))
  return f
}
const dateFmts = new Map<string, Intl.DateTimeFormat>()
export function dateFormat(opts: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(opts)
  let f = dateFmts.get(key)
  if (!f) dateFmts.set(key, (f = new Intl.DateTimeFormat('en-US', opts)))
  return f
}

export function sigDecimals(px: number, sig = 5) {
  if (!isFinite(px) || px === 0) return 2
  const mag = Math.floor(Math.log10(Math.abs(px))) + 1
  return Math.max(0, Math.min(6, sig - mag))
}

export function fmtPx(px: number | undefined, decimals?: number) {
  if (px == null || !isFinite(px)) return '—'
  const d = decimals ?? sigDecimals(px)
  return numberFormat(d).format(px)
}

export function fmtUsd(v: number | undefined, d = 2) {
  if (v == null || !isFinite(v)) return '—'
  const s = numberFormat(d).format(Math.abs(v))
  return `${v < 0 ? '-' : ''}$${s}`
}

export function fmtCompact(v: number | undefined, prefix = '$') {
  if (v == null || !isFinite(v)) return '—'
  const a = Math.abs(v)
  const [n, u] = a >= 1e12 ? [a / 1e12, 'T'] : a >= 1e9 ? [a / 1e9, 'B'] : a >= 1e6 ? [a / 1e6, 'M'] : a >= 1e3 ? [a / 1e3, 'K'] : [a, '']
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : u ? 2 : 2
  return `${v < 0 ? '-' : ''}${prefix}${n.toFixed(u === 'B' && n < 10 ? 1 : digits)}${u}`
}

export function fmtPct(v: number | undefined, d = 2, sign = true) {
  if (v == null || !isFinite(v)) return '—'
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(d)}%`
}

export function fmtSigned(v: number | undefined, d?: number) {
  if (v == null || !isFinite(v)) return '—'
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${fmtPx(Math.abs(v), d)}`
}

export const tone = (v: number | undefined) => (v == null || v === 0 ? 'text-fg-2' : v > 0 ? 'text-up' : 'text-down')

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return [h, m, s % 60].map((x) => String(x).padStart(2, '0')).join(':')
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Follows the 24-hour clock preference in Settings → Display. */
export function fmtClock(t: number) {
  return dateFormat({ hour: 'numeric', minute: '2-digit', hour12: !usePrefs.getState().clock24h }).format(t)
}

export function fmtDateTime(t: number, opts: Intl.DateTimeFormatOptions = {}) {
  return dateFormat({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: !usePrefs.getState().clock24h, ...opts }).format(t)
}
