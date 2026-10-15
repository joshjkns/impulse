// Dev helper: measure renderer CPU against a synthetic Hyperliquid feed (no network needed).
// Usage: node scripts/perf.mjs [seconds]   (expects `pnpm build && pnpm preview --port 5180`, or BASE=…)
//
// Mocks the REST info endpoint and the WebSocket (≈300 markets, assetCtxs on both dexes, L2 books,
// trades and live candles at roughly Hyperliquid's real rates), then records main-thread time per scenario.
import { chromium } from 'playwright'

const base = process.env.BASE ?? 'http://localhost:5180'
const secs = +(process.argv[2] ?? 10)
const N_MAIN = 220
const N_XYZ = 80

const mainCoins = ['BTC', 'ETH', 'SOL', 'HYPE', 'NEAR', 'ZEC', ...Array.from({ length: N_MAIN - 6 }, (_, i) => `C${i}`)]
const xyzCoins = ['xyz:SP500', 'xyz:CL', 'xyz:XYZ100', 'xyz:GOLD', 'xyz:NVDA', ...Array.from({ length: N_XYZ - 5 }, (_, i) => `xyz:X${i}`)]
const px0 = (coin) => (coin === 'BTC' ? 82000 : coin === 'ETH' ? 3100 : 10 + (coin.length * 37) % 900)
const ctx = (coin, t) => {
  const p = px0(coin) * (1 + 0.002 * Math.sin(t / 900 + coin.length))
  return { funding: '0.0000125', openInterest: String(1000 + (t % 97)), prevDayPx: String(px0(coin)), dayNtlVlm: String(1e6 * coin.length), markPx: p.toFixed(2), midPx: p.toFixed(2), oraclePx: p.toFixed(2) }
}
const universe = (coins) => coins.map((name) => ({ name, szDecimals: 3, maxLeverage: 20 }))
const candles = (coin, interval, start, end) => {
  const step = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 }[interval]
  const out = []
  let p = px0(coin)
  for (let t = Math.ceil(start / step) * step; t <= end && out.length < 5000; t += step) {
    const o = p
    p *= 1 + (Math.sin(t / step) * 0.004)
    out.push({ t, T: t + step - 1, s: coin, i: interval, o: String(o), c: String(p), h: String(Math.max(o, p) * 1.002), l: String(Math.min(o, p) * 0.998), v: '12.5', n: 10 })
  }
  return out
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
    case 'fundingHistory':
      return Array.from({ length: 400 }, (_, i) => ({ coin: body.coin, fundingRate: String(0.00001 * Math.sin(i)), premium: '0', time: body.startTime + i * 36e5 }))
    default:
      return []
  }
}

function book(coin, t) {
  const mid = px0(coin)
  const lv = (s) => Array.from({ length: 20 }, (_, i) => ({ px: String(mid + s * (i + 1)), sz: String(((t / 100 + i) % 7) + 0.5), n: 3 }))
  return { coin, time: t, levels: [lv(-1), lv(1)] }
}

/* Map minified profile frames back to sources when the build has sourcemaps (`vite build --sourcemap`). */
const maps = new Map()
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function vlq(str) {
  const out = []
  let v = 0
  let sh = 0
  for (const c of str) {
    let d = B64.indexOf(c)
    const more = d & 32
    d &= 31
    v += d << sh
    if (more) sh += 5
    else {
      out.push(v & 1 ? -(v >> 1) : v >> 1)
      v = 0
      sh = 0
    }
  }
  return out
}
async function loadMap(url) {
  if (maps.has(url)) return
  maps.set(url, null)
  try {
    const m = await (await fetch(url + '.map')).json()
    let src = 0
    let sl = 0
    const lines = m.mappings.split(';').map((ln) => {
      let col = 0
      return ln.split(',').filter(Boolean).map((seg) => {
        const d = vlq(seg)
        col += d[0]
        if (d.length > 1) {
          src += d[1]
          sl += d[2]
        }
        return [col, src, sl]
      })
    })
    maps.set(url, { lines, sources: m.sources })
  } catch {
    /* no map */
  }
}
function resolve(url, line, col) {
  const m = maps.get(url)
  const segs = m?.lines[line]
  if (!segs) return `${url.split('/').pop()}:${line}`
  let best = segs[0]
  for (const s of segs) if (s[0] <= col) best = s
  return `${m.sources[best[1]].replace(/.*node_modules\/(\.pnpm\/[^/]+\/node_modules\/)?/, '').replace(/.*\/src\//, 'src/')}:${best[2] + 1}`
}

async function scenario(browser, name, path, seed) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })
  await page.addInitScript((seed) => {
    sessionStorage.setItem('impulse.splash', '1')
    for (const [k, v] of Object.entries(seed ?? {})) localStorage.setItem(k, v)
  }, seed)
  await page.route('https://api.hyperliquid.xyz/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(info(r.request().postDataJSON())) }))
  await page.route(/app\.hyperliquid\.xyz|fonts|127\.0\.0\.1:7420/, (r) => r.abort())
  const timers = []
  await page.routeWebSocket('wss://api.hyperliquid.xyz/ws', (ws) => {
    const subs = []
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw))
      if (m.method === 'ping') return ws.send(JSON.stringify({ channel: 'pong' }))
      if (m.method === 'subscribe') {
        subs.push(m.subscription)
        ws.send(JSON.stringify({ channel: 'subscriptionResponse', data: m }))
      }
      if (m.method === 'unsubscribe') ws.send(JSON.stringify({ channel: 'subscriptionResponse', data: m }))
    })
    const send = (channel, data) => ws.send(JSON.stringify({ channel, data }))
    timers.push(setInterval(() => {
      const t = Date.now()
      for (const s of subs) if (s.type === 'assetCtxs') send('assetCtxs', { dex: s.dex ?? '', ctxs: (s.dex === 'xyz' ? xyzCoins : mainCoins).map((c) => ctx(c, t)) })
    }, 300))
    timers.push(setInterval(() => {
      const t = Date.now()
      for (const s of subs) {
        if (s.type === 'l2Book') send('l2Book', book(s.coin, t))
        if (s.type === 'trades') send('trades', [{ coin: s.coin, side: t % 2 ? 'B' : 'A', px: String(px0(s.coin)), sz: '0.1', time: t, hash: '0x', tid: t, users: ['0x', '0x'] }])
      }
    }, 120))
    timers.push(setInterval(() => {
      const t = Date.now()
      for (const s of subs) if (s.type === 'candle') send('candle', candles(s.coin, s.interval, t - 3e6, t).at(-1))
    }, 500))
  })
  await page.goto(base + path)
  await page.waitForTimeout(5000)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  if (process.env.LAYERS) {
    // Composited layers and why they exist (each one costs commit time every frame).
    await cdp.send('LayerTree.enable')
    const layers = await new Promise((res) => cdp.once('LayerTree.layerTreeDidChange', (e) => res(e.layers ?? [])))
    const reasons = new Map()
    for (const l of layers) {
      if (!l.drawsContent) continue
      const r = await cdp.send('LayerTree.compositingReasons', { layerId: l.layerId }).catch(() => ({ compositingReasons: ['?'] }))
      const k = r.compositingReasons.join(',') || '(root)'
      reasons.set(k, (reasons.get(k) ?? 0) + 1)
    }
    console.log(`${layers.length} layers;`, [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${n}× ${k}`).join(' | '))
  }
  if (process.env.TRACE) await page.context().browser().startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] })
  if (process.env.PROFILE) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.start')
  }
  await page.waitForTimeout(secs * 1000)
  if (process.env.PROFILE) {
    // Self time per function, top 25: where the remaining main-thread time goes.
    const { profile } = await cdp.send('Profiler.stop')
    for (const n of profile.nodes) if (n.callFrame.url.endsWith('.js')) await loadMap(n.callFrame.url)
    const self = new Map()
    const dt = profile.timeDeltas
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    profile.samples.forEach((id, i) => {
      const f = byId.get(id).callFrame
      const k = `${f.functionName || '(anon)'} ${resolve(f.url, f.lineNumber, f.columnNumber)}`
      self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000)
    })
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, +process.env.PROFILE || 25).map(([k, v]) => `${(v / secs).toFixed(1).padStart(7)} ms/s  ${k}`).join('\n'))
  }
  if (process.env.TRACE) {
    // Main-thread time by trace event name: separates paint/composite/raster from script.
    const buf = await page.context().browser().stopTracing()
    const { traceEvents } = JSON.parse(buf.toString())
    const main = traceEvents.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
    const tot = new Map()
    for (const e of traceEvents) if (e.ph === 'X' && e.tid === main?.tid && e.dur) tot.set(e.name, (tot.get(e.name) ?? [0, 0]).map((v, i) => v + (i ? 1 : e.dur / 1000)))
    console.log([...tot].sort((a, b) => b[1][0] - a[1][0]).slice(0, 18).map(([k, [ms, n]]) => `${(ms / secs).toFixed(1).padStart(7)} ms/s ${String(n).padStart(6)}x  ${k}`).join('\n'))
  }
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  const d = (k) => (((after[k] ?? 0) - (before[k] ?? 0)) / secs) * 1000
  timers.forEach(clearInterval)
  console.log(
    `${name.padEnd(18)} script ${d('ScriptDuration').toFixed(0).padStart(4)} ms/s · layout ${d('LayoutDuration').toFixed(0).padStart(3)} ms/s · style ${d('RecalcStyleDuration').toFixed(0).padStart(3)} ms/s · task ${d('TaskDuration').toFixed(0).padStart(4)} ms/s · heap ${(after.JSHeapUsedSize / 1e6).toFixed(0)} MB`,
  )
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name.replace(/ /g, "-")}.png` })
  await page.close()
}

const custom = {
  'impulse.workspaces': JSON.stringify({
    version: 1,
    state: {
      active: 'perf',
      tabs: [
        {
          id: 'perf',
          kind: 'custom',
          title: 'BTC tracker',
          autoLayout: true,
          layout: [],
          widgets: (process.env.WIDGETS?.split(',') ?? ['price_oi', 'orderbook_heatmap', 'funding', 'trades', 'liquidations', 'candles']).map((kind, i) => ({ id: `w${i}`, kind, coin: 'BTC', title: kind, subtitle: kind, status: 'ready' })),
        },
      ],
    },
  }),
}
// autoLayout fills `layout` on load only when widgets are added; give it an even 3x2 tiling.
{
  const s = JSON.parse(custom['impulse.workspaces'])
  s.state.tabs[0].layout = s.state.tabs[0].widgets.map((w, i) => ({ i: w.id, x: (i % 3) * 8, y: Math.floor(i / 3) * 12, w: 8, h: 12 }))
  custom['impulse.workspaces'] = JSON.stringify(s)
}

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const only = process.env.ONLY
for (const [name, path, seed] of [
  ['home', '/', undefined],
  ['market tab', '/workspaces/btc', undefined],
  ['custom workspace', '/workspaces/perf', custom],
]) if (!only || name.includes(only)) await scenario(browser, name, path, seed)
await browser.close()
