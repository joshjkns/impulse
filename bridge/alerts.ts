import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { markets, news, resolve } from './data.ts'
import { onSmartMoney, smartMoney } from './smartmoney.ts'

export interface Alert {
  id: string
  title: string
  description: string
  kind: 'price' | 'change' | 'funding' | 'open_interest' | 'smart_money' | 'news'
  coin?: string
  op?: 'above' | 'below'
  value?: number
  direction?: 'long' | 'short'
  addedUsd?: number
  query?: string
  icon?: 'bell' | 'globe' | 'chart' | 'bolt'
  createdAt: number
  lastFiredAt?: number
  /** Edge-trigger state: true while the condition holds, so we only fire on transitions. null = not primed yet. */
  armed: boolean | null
  seen?: string[]
}

export interface Fired {
  alert: Alert
  title: string
  body: string
  at: number
}

const usd = (v: number) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`)

export class AlertEngine {
  private alerts: Alert[] = []
  private file: string
  private listeners = new Set<(f: Fired) => void>()
  private changeListeners = new Set<(a: Alert[]) => void>()
  ntfyTopic = ''

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = path.join(dir, 'alerts.json')
    if (existsSync(this.file)) {
      try {
        this.alerts = JSON.parse(readFileSync(this.file, 'utf8')) as Alert[]
      } catch {
        this.alerts = []
      }
    }
  }

  list = () => this.alerts
  onFire = (fn: (f: Fired) => void) => (this.listeners.add(fn), () => this.listeners.delete(fn))
  onChange = (fn: (a: Alert[]) => void) => (this.changeListeners.add(fn), () => this.changeListeners.delete(fn))

  private save() {
    writeFileSync(this.file, JSON.stringify(this.alerts, null, 2))
    this.changeListeners.forEach((fn) => fn(this.alerts))
  }

  async create(input: Omit<Alert, 'id' | 'createdAt' | 'armed'>) {
    if (input.coin) input.coin = (await resolve(input.coin)).coin
    if (input.kind === 'news' && !input.query) throw new Error('news alerts need a query')
    if (['price', 'funding', 'open_interest', 'change'].includes(input.kind) && (input.value == null || !input.coin))
      throw new Error(`${input.kind} alerts need coin and value`)
    if (input.kind === 'smart_money' && !input.coin) throw new Error('smart_money alerts need a coin')
    const alert: Alert = {
      ...input,
      direction: input.direction ?? (input.kind === 'smart_money' ? 'short' : undefined),
      icon: input.icon ?? (input.kind === 'news' ? 'globe' : 'bell'),
      id: Math.random().toString(36).slice(2, 10),
      createdAt: Date.now(),
      armed: false,
    }
    // Prime: don't fire for conditions already true or headlines already published.
    // If data isn't available yet (first smart-money scan, GDELT hiccup) prime on the first real read instead.
    if (alert.kind === 'news') alert.seen = await news(alert.query!, 24, 30).then((hs) => hs.map((h) => h.url), () => undefined)
    else if (alert.kind === 'smart_money' && !smartMoney()[alert.coin!]) alert.armed = null
    else alert.armed = (await this.evaluate(alert)) != null
    this.alerts.push(alert)
    this.save()
    return alert
  }

  remove(id: string) {
    this.alerts = this.alerts.filter((a) => a.id !== id)
    this.save()
  }

  /** Returns a firing message when the condition holds, else null. */
  private async evaluate(a: Alert): Promise<{ title: string; body: string } | null> {
    if (a.kind === 'news') return null
    const m = a.coin ? (await markets()).get(a.coin) : undefined
    if (!m) return null
    const cmp = (v: number) => (a.op === 'below' ? v <= a.value! : v >= a.value!)
    switch (a.kind) {
      case 'price':
        return cmp(m.markPx) ? { title: a.title, body: `${m.name} ${a.op === 'below' ? 'fell to' : 'hit'} ${m.markPx} (${m.changePct.toFixed(2)}% today).` } : null
      case 'change':
        return Math.abs(m.changePct) >= Math.abs(a.value!)
          ? { title: a.title, body: `${m.name} is ${m.changePct >= 0 ? 'up' : 'down'} ${Math.abs(m.changePct).toFixed(1)}% in 24h.` }
          : null
      case 'funding':
        return cmp(m.fundingAnnualPct) ? { title: a.title, body: `${m.name} funding is ${m.fundingAnnualPct.toFixed(1)}% annualised.` } : null
      case 'open_interest':
        return cmp(m.openInterestUsd) ? { title: a.title, body: `${m.name} open interest reached ${usd(m.openInterestUsd)}.` } : null
      case 'smart_money': {
        const s = smartMoney()[a.coin!]
        if (!s) return null
        const short = a.direction !== 'long'
        const net = short ? s.short > s.long : s.long > s.short
        const added = short ? s.shortDelta24h : s.longDelta24h
        const threshold = a.addedUsd ?? 5_000_000
        if (added >= threshold)
          return { title: a.title, body: `Traders up $1M+ added ${usd(added)} in ${m.symbol} ${short ? 'shorts' : 'longs'} in the last 24h.` }
        if (net) return { title: a.title, body: `Traders up $1M+ are now net ${short ? 'short' : 'long'} ${m.symbol}: ${usd(s.short)} short vs ${usd(s.long)} long.` }
        return null
      }
    }
    return null
  }

  private fire(alert: Alert, title: string, body: string) {
    alert.lastFiredAt = Date.now()
    const f: Fired = { alert, title, body, at: alert.lastFiredAt }
    this.listeners.forEach((fn) => fn(f))
    if (this.ntfyTopic)
      void fetch(`https://ntfy.sh/${encodeURIComponent(this.ntfyTopic)}`, {
        method: 'POST',
        headers: { Title: title, Tags: 'zap' },
        body,
      }).catch(() => undefined)
  }

  /** Desktop banner for when no Impulse tab is open: native via the Electron app, else macOS osascript. */
  desktopNotify(title: string, body: string) {
    if (process.send) return void process.send({ type: 'notify', title, body })
    if (process.platform !== 'darwin') return
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    execFile('osascript', ['-e', `display notification "${esc(body)}" with title "Impulse" subtitle "${esc(title)}"`], () => undefined)
  }

  private async tickMarkets() {
    for (const a of this.alerts) {
      if (a.kind === 'news' || a.kind === 'smart_money') continue
      const hit = await this.evaluate(a).catch(() => null)
      if (hit && a.armed === false) this.fire(a, hit.title, hit.body)
      a.armed = !!hit
    }
    this.save()
  }

  private async tickSmartMoney() {
    for (const a of this.alerts.filter((x) => x.kind === 'smart_money')) {
      if (!smartMoney()[a.coin!]) continue
      const hit = await this.evaluate(a).catch(() => null)
      if (hit && a.armed === false) this.fire(a, hit.title, hit.body)
      a.armed = !!hit
    }
    this.save()
  }

  private async tickNews() {
    for (const a of this.alerts.filter((x) => x.kind === 'news')) {
      try {
        const items = await news(a.query!, 6, 15)
        const seen = new Set(a.seen ?? [])
        const fresh = a.seen ? items.filter((h) => !seen.has(h.url)) : []
        if (fresh.length) {
          const top = fresh[0]
          let body = `${top.domain}`
          if (a.coin) {
            const m = (await markets()).get(a.coin)
            if (m) body = `${m.name} ${m.changePct >= 0 ? 'up' : 'down'} ${Math.abs(m.changePct).toFixed(1)}% today · ${top.domain}`
          }
          this.fire(a, top.title, body)
        }
        a.seen = [...items.map((h) => h.url), ...(a.seen ?? [])].slice(0, 200)
      } catch {
        /* GDELT rate-limits bursts; try next tick */
      }
    }
    this.save()
  }

  start() {
    setInterval(() => void this.tickMarkets(), 20_000)
    setInterval(() => void this.tickNews(), 5 * 60_000)
    setTimeout(() => void this.tickNews(), 30_000)
    onSmartMoney(() => void this.tickSmartMoney())
  }
}
