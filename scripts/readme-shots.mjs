// Dev helper: regenerate the README screenshots in docs/ against a mocked Hyperliquid feed (no network needed).
// Usage: pnpm build && pnpm preview --port 5180, then node scripts/readme-shots.mjs   (or BASE=…)
//
// Prices, candles and books are synthetic but seeded per coin, so every run draws the same pictures.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.env.BASE ?? 'http://localhost:5180'
const out = process.env.OUT ?? 'docs'

// Every market the catalog knows about, so names, icons and asset classes look real.
const catalog = readFileSync(new URL('../src/lib/catalog.ts', import.meta.url), 'utf8')
const keys = [...catalog.matchAll(/^ {2}'?([A-Za-z0-9:]+)'?: [CEKIF]\(/gm)].map((m) => m[1])
const mainCoins = keys.filter((k) => !k.includes(':'))
const xyzCoins = keys.filter((k) => k.startsWith('xyz:'))

const PX = {
  BTC: 112400, ETH: 4180, HYPE: 46.2, SOL: 214, NEAR: 3.12, ZEC: 268, XRP: 2.91, DOGE: 0.241, SUI: 3.62, AVAX: 29.4, LINK: 22.8,
  BNB: 1012, ADA: 0.84, LTC: 112, ENA: 0.62, AAVE: 286, TAO: 412, 'xyz:SP500': 6688, 'xyz:XYZ100': 24810, 'xyz:CL': 62.4,
  'xyz:GOLD': 3912, 'xyz:SILVER': 47.6, 'xyz:NVDA': 186.2, 'xyz:TSLA': 438, 'xyz:AAPL': 256, 'xyz:MSFT': 514, 'xyz:EUR': 1.168,
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)
const rand = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
const px0 = (coin) => PX[coin] ?? 5 + (hash(coin) % 4000) / 10
const change = (coin) => ((hash(coin + 'd') % 1600) - 700) / 10000

const ctx = (coin, t) => {
  const p = px0(coin) * (1 + 0.0008 * Math.sin(t / 2200 + hash(coin)))
  const vol = 2e5 + (hash(coin + 'v') % 1000) * (coin === 'BTC' ? 4e6 : coin.length < 5 ? 4e5 : 6e4)
  return {
    funding: String(((hash(coin + 'f') % 40) - 12) * 1e-6),
    openInterest: String((vol * 0.6) / p),
    prevDayPx: String(px0(coin) / (1 + change(coin))),
    dayNtlVlm: String(vol),
    markPx: p.toPrecision(6),
    midPx: p.toPrecision(6),
    oraclePx: p.toPrecision(6),
  }
}
const universe = (coins) => coins.map((name) => ({ name, szDecimals: px0(name) > 1000 ? 4 : 1, maxLeverage: 20 }))

/** A random walk that ends at today's price, seeded by coin and interval. */
function candles(coin, interval, start, end) {
  const step = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 }[interval]
  const first = Math.ceil(start / step) * step
  const n = Math.min(5000, Math.floor((end - first) / step) + 1)
  const r = rand(hash(coin + interval))
  const vol = { '1m': 0.0012, '5m': 0.002, '15m': 0.003, '1h': 0.006, '4h': 0.012, '1d': 0.03 }[interval]
  const closes = [px0(coin)]
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] / (1 + (r() - 0.5 + 0.03 * Math.sin(i / 17)) * vol * 2))
  closes.reverse()
  return closes.map((c, i) => {
    const t = first + i * step
    const o = i ? closes[i - 1] : c
    const v = (0.4 + r()) * (px0(coin) > 1000 ? 40 : 4e4)
    return { t, T: t + step - 1, s: coin, i: interval, o: String(o), c: String(c), h: String(Math.max(o, c) * (1 + r() * vol)), l: String(Math.min(o, c) * (1 - r() * vol)), v: String(v), n: 20 }
  })
}

function info(body) {
  switch (body.type) {
    case 'perpDexs':
      return [null, { name: 'xyz', fullName: 'xyz', deployer: '0x0', oracleUpdater: null }]
    case 'metaAndAssetCtxs': {
      const coins = body.dex === 'xyz' ? xyzCoins : mainCoins
      return [{ universe: universe(coins) }, coins.map((c) => ctx(c, Date.now()))]
    }
    case 'candleSnapshot':
      return candles(body.req.coin, body.req.interval, body.req.startTime, body.req.endTime)
    case 'fundingHistory': {
      const r = rand(hash(body.coin + 'fh'))
      return Array.from({ length: 480 }, (_, i) => ({ coin: body.coin, fundingRate: String((Math.sin(i / 40) * 0.6 + r() - 0.3) * 2.5e-5), premium: '0', time: body.startTime + i * 36e5 }))
    }
    default:
      return []
  }
}

function book(coin, t) {
  const mid = px0(coin)
  const tick = mid * 0.0001
  const r = rand(hash(coin) + Math.floor(t / 400))
  // Thin noise everywhere, plus a few walls that sit at the same levels so the heatmap shows bands.
  const usd = (i, s) => 20 + r() ** 4 * 15000 + ((i + (s > 0 ? 2 : 0)) % 7 === 4 ? 250000 + r() * 50000 : 0)
  const lv = (s) => Array.from({ length: 20 }, (_, i) => ({ px: (mid + s * (i + 1) * tick).toPrecision(6), sz: String(usd(i, s) / mid), n: 3 }))
  return { coin, time: t, levels: [lv(-1), lv(1)] }
}

const WORKSPACES = {
  state: {
    tabs: [
      { id: 'btc', kind: 'market', coin: 'BTC' },
      { id: 'hype', kind: 'market', coin: 'HYPE' },
      {
        id: 'demo',
        kind: 'custom',
        title: 'BTC deep dive',
        autoLayout: true,
        layout: [
          { i: 'w1', x: 0, y: 0, w: 12, h: 12 },
          { i: 'w2', x: 12, y: 0, w: 12, h: 12 },
          { i: 'w3', x: 0, y: 12, w: 12, h: 12 },
          { i: 'w4', x: 12, y: 12, w: 12, h: 12 },
        ],
        widgets: [
          { id: 'w1', kind: 'candles', coin: 'BTC', title: 'BTC chart', subtitle: 'BTC candles, live.', status: 'ready' },
          { id: 'w2', kind: 'orderbook_heatmap', coin: 'BTC', title: 'BTC order book liquidity', subtitle: "Dollars resting in BTC's order book at each price level.", status: 'ready' },
          { id: 'w3', kind: 'volume_profile', coin: 'BTC', title: 'BTC volume profile', subtitle: 'Where BTC traded over the past 30 days.', status: 'ready' },
          { id: 'w4', kind: 'funding', coin: 'BTC', title: 'BTC funding rate', subtitle: "BTC's annualised funding over the past month.", status: 'ready' },
        ],
      },
      { id: 'sp', kind: 'market', coin: 'xyz:SP500' },
    ],
    active: 'demo',
  },
  version: 1,
}

async function newPage(browser, { theme = 'impulse', accent = 'blue' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 })
  await page.addInitScript(
    ([ws, prefs]) => {
      sessionStorage.setItem('impulse.splash', '1')
      if (!localStorage.getItem('impulse.workspaces')) localStorage.setItem('impulse.workspaces', ws)
      localStorage.setItem('impulse.prefs', prefs)
    },
    [JSON.stringify(WORKSPACES), JSON.stringify({ state: { theme, accent }, version: 1 })],
  )
  const timers = []
  page.on('close', () => timers.forEach(clearInterval))
  await page.route('https://api.hyperliquid.xyz/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(info(r.request().postDataJSON())) }))
  await page.route(/127\.0\.0\.1:7420/, (r) => r.abort())
  await page.routeWebSocket('wss://api.hyperliquid.xyz/ws', (ws) => {
    const subs = []
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw))
      if (m.method === 'ping') return ws.send(JSON.stringify({ channel: 'pong' }))
      if (m.method === 'subscribe') subs.push(m.subscription)
      ws.send(JSON.stringify({ channel: 'subscriptionResponse', data: m }))
    })
    const send = (channel, data) => ws.send(JSON.stringify({ channel, data }))
    timers.push(
      setInterval(() => {
        const t = Date.now()
        for (const s of subs) if (s.type === 'assetCtxs') send('assetCtxs', { dex: s.dex ?? '', ctxs: (s.dex === 'xyz' ? xyzCoins : mainCoins).map((c) => ctx(c, t)) })
      }, 500),
      setInterval(() => {
        const t = Date.now()
        for (const s of subs) {
          if (s.type === 'l2Book') send('l2Book', book(s.coin, t))
          if (s.type === 'trades') send('trades', [{ coin: s.coin, side: t % 3 ? 'B' : 'A', px: String(px0(s.coin) * (1 + (Math.random() - 0.5) * 2e-4)), sz: (Math.random() * 2).toFixed(3), time: t, hash: '0x', tid: t, users: ['0x', '0x'] }])
        }
      }, 250),
    )
  })
  return page
}

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const shoot = async (name, path, opts, act, wait = 5000) => {
  const page = await newPage(browser, opts)
  await page.goto(base + path)
  await page.waitForTimeout(wait)
  if (act) await act(page)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log(`${out}/${name}.png`)
  await page.close()
}

await shoot('home', '/')
await shoot('workspace', '/workspaces/demo', {}, null, 15000)
await shoot('market', '/workspaces/btc')
await shoot('themes', '/', { theme: 'midnight', accent: 'violet' }, async (page) => {
  await page.getByRole('button', { name: 'Settings' }).last().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Display' }).click()
  await page.waitForTimeout(800)
})
await browser.close()
