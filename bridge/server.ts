#!/usr/bin/env node
/**
 * Impulse bridge — a small local daemon that connects the web terminal to the user's own AI harness.
 *
 *   browser ──ws──▶ bridge ──spawn──▶ claude / codex / grok / gemini / pi / omp / opencode / …
 *                     ▲                       │
 *                     └──── POST /call ◀── impulse MCP server (bridge/mcp.ts) or CLI (bridge/cli.ts)
 *
 * Tool calls from the harness land here: data tools run against Hyperliquid, UI tools are forwarded to
 * the open tab. Every call becomes a "step" in the chat. Alerts and smart-money tracking also live here so
 * they keep running when no tab is open.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { AlertEngine } from './alerts.ts'
import { candles, funding, markets, news, orderbook, resolve, trades } from './data.ts'
import { HARNESSES, detectHarnesses, searchPath, which, type HarnessStatus, type RunContext } from './harnesses.ts'
import { oiSeries, startOiRecorder } from './oi.ts'
import { createParser } from './parse.ts'
import { smartMoney, onSmartMoney, startSmartMoney } from './smartmoney.ts'
import { SYSTEM_PROMPT, TOOLS, toolByName } from './tools.ts'

const PORT = Number(process.env.IMPULSE_BRIDGE_PORT ?? 7420)
const HOST = '127.0.0.1'
const URL_BASE = `http://${HOST}:${PORT}`
const here = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(here, '..', '.impulse')
mkdirSync(DATA_DIR, { recursive: true })

/* ------------------------------------------------------------------ state */

interface Run {
  id: string
  threadId: string
  child?: ChildProcess
  steps: number
  startedAt: number
  cancelled?: boolean
  /** The tab that asked; UI tools run there so other open tabs can't answer with stale state. */
  origin?: WebSocket
}

const clients = new Set<WebSocket>()
const runs = new Map<string, Run>()
const pendingUi = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>()
let harnesses: HarnessStatus[] = []
const settingsFile = path.join(DATA_DIR, 'settings.json')
const briefingFile = path.join(DATA_DIR, 'briefing.json')
let settings: { ntfyTopic?: string; customCommand?: string } = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {}
let briefing: unknown = existsSync(briefingFile) ? JSON.parse(readFileSync(briefingFile, 'utf8')) : null

const feedFile = path.join(DATA_DIR, 'feed.json')
let feed: { id: string; title: string; body: string; at: number; alertId: string; coin?: string }[] = existsSync(feedFile) ? JSON.parse(readFileSync(feedFile, 'utf8')) : []

const alerts = new AlertEngine(DATA_DIR)
alerts.ntfyTopic = settings.ntfyTopic ?? ''

/** Harness errors are often raw API JSON; surface just the human message. */
function cleanError(e?: string) {
  if (!e) return e
  const t = e.trim()
  const start = t.indexOf('{')
  if (start >= 0) {
    try {
      const j = JSON.parse(t.slice(start)) as { message?: string; error?: { message?: string } | string }
      const msg = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message)
      if (msg) return msg
    } catch {
      /* not JSON */
    }
  }
  return t
}

const send = (ws: WebSocket, msg: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg))
const broadcast = (msg: unknown) => clients.forEach((c) => send(c, msg))

alerts.onFire((f) => {
  feed = [{ id: `${f.alert.id}.${f.at}`, title: f.title, body: f.body, at: f.at, alertId: f.alert.id, coin: f.alert.coin }, ...feed].slice(0, 200)
  writeFileSync(feedFile, JSON.stringify(feed))
  broadcast({ type: 'alert_fired', alert: f.alert, title: f.title, body: f.body, at: f.at })
  if (!clients.size) alerts.desktopNotify(f.title, f.body)
})
alerts.onChange((list) => broadcast({ type: 'alerts', alerts: list }))
onSmartMoney((data) => broadcast({ type: 'smart_money', data }))

/* ------------------------------------------------------------------ tools */

const trim = (v: unknown, max = 4000) => {
  const s = JSON.stringify(v)
  return s.length > max ? JSON.parse(JSON.stringify(v, (_k, x) => (Array.isArray(x) && x.length > 30 ? [...x.slice(0, 30), `…${x.length - 30} more`] : x))) : v
}

async function runBridgeTool(name: string, a: Record<string, any>): Promise<unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (name) {
    case 'list_markets': {
      let list = [...(await markets()).values()]
      if (a.query) {
        const q = String(a.query).toLowerCase()
        list = list.filter((m) => m.coin.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      }
      if (a.assetClass) list = list.filter((m) => m.assetClass === a.assetClass)
      if (a.industry) list = list.filter((m) => m.industries.some((i) => i.toLowerCase() === String(a.industry).toLowerCase()))
      const key = { volume: 'volume24h', change: 'changePct', openInterest: 'openInterestUsd', funding: 'fundingAnnualPct' }[(a.sortBy as string) ?? 'volume'] as 'volume24h'
      list.sort((x, y) => (a.sortBy === 'change' ? Math.abs(y[key]) - Math.abs(x[key]) : y[key] - x[key]))
      return list.slice(0, a.limit ?? 30).map((m) => ({
        coin: m.coin,
        name: m.name,
        assetClass: m.assetClass,
        price: m.markPx,
        changePct: +m.changePct.toFixed(2),
        volume24h: Math.round(m.volume24h),
        openInterestUsd: Math.round(m.openInterestUsd),
        fundingAnnualPct: +m.fundingAnnualPct.toFixed(2),
      }))
    }
    case 'get_market': {
      const m = await resolve(a.coin)
      return { ...m, smartMoney: smartMoney()[m.coin] ?? null }
    }
    case 'get_candles': {
      const m = await resolve(a.coin)
      return { coin: m.coin, interval: a.interval ?? '1h', ...(await candles(m.coin, a.interval ?? '1h', a.lookbackHours ?? 72)) }
    }
    case 'get_orderbook': {
      const m = await resolve(a.coin)
      return { coin: m.coin, ...(await orderbook(m.coin, a.levels ?? 20)) }
    }
    case 'get_funding_history': {
      const m = await resolve(a.coin)
      return { coin: m.coin, ...(await funding(m.coin, a.days ?? 14)) }
    }
    case 'get_recent_trades': {
      const m = await resolve(a.coin)
      return { coin: m.coin, ...(await trades(m.coin)) }
    }
    case 'get_smart_money': {
      const m = await resolve(a.coin)
      const s = smartMoney()[m.coin]
      return s
        ? { coin: m.coin, definition: 'accounts with >= $1M all-time PnL, largest 100 by account value', ...s }
        : { coin: m.coin, note: 'No tracked $1M+ traders hold this market yet (or the first scan is still running).' }
    }
    case 'search_news':
      return news(String(a.query), a.hours ?? 24, a.limit ?? 10)
    case 'create_alert': {
      const al = await alerts.create(a as never)
      return { id: al.id, title: al.title, description: al.description, kind: al.kind, coin: al.coin, icon: al.icon, status: 'live' }
    }
    case 'list_alerts':
      return alerts.list().map(({ armed: _a, seen: _s, ...rest }) => rest)
    case 'delete_alert':
      alerts.remove(String(a.id))
      return { deleted: a.id }
    case 'set_briefing':
      briefing = { text: a.text, bullets: a.bullets ?? [], at: Date.now() }
      writeFileSync(briefingFile, JSON.stringify(briefing))
      broadcast({ type: 'briefing', briefing })
      return { ok: true }
  }
  throw new Error(`Unknown tool ${name}`)
}

let lastActive: WebSocket | undefined

function runUiTool(run: Run | undefined, name: string, args: unknown) {
  const open = (w?: WebSocket) => w && w.readyState === w.OPEN && clients.has(w)
  const target = open(run?.origin) ? run!.origin! : open(lastActive) ? lastActive! : [...clients].pop()
  if (!target) return Promise.reject(new Error('No Impulse tab is open. Ask the user to open the app.'))
  const callId = Math.random().toString(36).slice(2)
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingUi.delete(callId)
      reject(new Error('The Impulse tab did not respond in time'))
    }, 30_000)
    pendingUi.set(callId, { resolve, reject, timer })
    send(target, { type: 'tool_call', callId, runId: run?.id, threadId: run?.threadId, name, args })
  })
}

async function handleCall(runId: string, name: string, args: Record<string, unknown>) {
  const def = toolByName(name)
  if (!def) throw new Error(`Unknown tool ${name}`)
  const run = runs.get(runId)
  // Called from a harness the user wired up directly (e.g. `claude mcp add impulse …`): no chat to report to.
  if (!runId) return def.target === 'ui' ? runUiTool(undefined, def.name, args) : runBridgeTool(def.name, args)
  if (!run) throw new Error('This Impulse run has finished. Ask again from the Impulse chat.')
  const stepId = `${runId}.${++run.steps}`
  const base = { id: stepId, name: def.name, label: def.label(args), args }
  broadcast({ type: 'step', runId, threadId: run.threadId, step: { ...base, status: 'running' } })
  try {
    const result = def.target === 'ui' ? await runUiTool(run, def.name, args) : await runBridgeTool(def.name, args)
    broadcast({ type: 'step', runId, threadId: run.threadId, step: { ...base, status: 'done', result: trim(result, 2000) } })
    return result
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.warn(`[tool] ${def.name} failed: ${error}`)
    broadcast({ type: 'step', runId, threadId: run.threadId, step: { ...base, status: 'error', error } })
    throw e
  }
}

/* ------------------------------------------------------------------ runs */

interface ChatRequest {
  threadId: string
  runId: string
  prompt: string
  harness: string
  model?: string
  session?: string
  history?: { role: 'user' | 'assistant'; text: string }[]
  context?: string
}

function startRun(req: ChatRequest, origin?: WebSocket) {
  const run: Run = { id: req.runId, threadId: req.threadId, steps: 0, startedAt: Date.now(), origin }
  runs.set(run.id, run)
  const done = (ok: boolean, extra: Record<string, unknown> = {}) => {
    if (!runs.has(run.id)) return
    runs.delete(run.id)
    broadcast({ type: 'run_done', runId: run.id, threadId: run.threadId, ok: ok && !run.cancelled, cancelled: run.cancelled, durationMs: Date.now() - run.startedAt, steps: run.steps, ...extra, error: cleanError(extra.error as string | undefined) })
  }

  // Outside any git repo, so harnesses treat the run folder (and the MCP config we drop there) as the project.
  const workdir = path.join(tmpdir(), 'impulse-runs', req.threadId.replace(/[^\w-]/g, ''))
  mkdirSync(workdir, { recursive: true })
  const env = { IMPULSE_RUN: run.id, IMPULSE_BRIDGE_URL: URL_BASE }
  const mcpScript = path.join(here, 'mcp.ts')
  const cliScript = path.join(here, 'cli.ts')

  const harness = HARNESSES.find((h) => h.id === req.harness)
  const transcript =
    req.history?.length && (!harness?.sessions || !req.session)
      ? `Conversation so far:\n${req.history.map((m) => `${m.role === 'user' ? 'User' : 'Impulse'}: ${m.text}`).join('\n\n')}\n\n`
      : ''
  const ctx: RunContext = {
    prompt: `${req.context ? `[Context: ${req.context}]\n\n` : ''}${transcript}${req.prompt}`,
    system: `${SYSTEM_PROMPT}\n- Notifications for alerts go to the Impulse app${settings.ntfyTopic ? ' and the user\'s phone (ntfy push is configured)' : ' and desktop (phone push is not configured; mention they can add an ntfy topic in Settings)'}.`,
    mcp: { command: process.execPath, args: [mcpScript], env },
    cliHint: `node ${JSON.stringify(cliScript).slice(1, -1)}`,
    session: req.session,
    model: req.model || undefined,
    workdir,
    bridgeUrl: URL_BASE,
  }

  let child: ChildProcess
  let parserKind: Parameters<typeof createParser>[0] = 'text'
  let session = req.session
  if (req.harness === 'custom') {
    if (!settings.customCommand) return done(false, { error: 'Set a custom command in Settings first.' })
    const mcpFile = path.join(workdir, 'impulse.mcp.json')
    writeFileSync(mcpFile, JSON.stringify({ mcpServers: { impulse: ctx.mcp } }, null, 2))
    child = spawn('/bin/sh', ['-c', settings.customCommand], {
      cwd: workdir,
      env: { ...process.env, ...env, PATH: searchPath(), IMPULSE_PROMPT: `${ctx.system}\n\nTools via shell: ${ctx.cliHint} list\n\n---\n\n${ctx.prompt}`, IMPULSE_MCP_CONFIG: mcpFile },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } else {
    const bin = harness && which(harness.bin)
    if (!harness || !bin) return done(false, { error: `${harness?.name ?? req.harness} is not installed. Pick another harness in Settings.` })
    const launch = harness.launch(ctx)
    for (const [rel, contents] of Object.entries(launch.files ?? {})) {
      const p = path.join(workdir, rel)
      mkdirSync(path.dirname(p), { recursive: true })
      writeFileSync(p, contents)
    }
    parserKind = launch.parser
    if (launch.session) session = launch.session
    child = spawn(bin, launch.args, { cwd: workdir, env: { ...process.env, ...env, ...launch.env, PATH: searchPath() }, stdio: ['ignore', 'pipe', 'pipe'] })
  }
  run.child = child
  broadcast({ type: 'run_started', runId: run.id, threadId: run.threadId, harness: req.harness })

  let gotText = false
  let error: string | undefined
  const emit = (msg: Record<string, unknown>) => broadcast({ runId: run.id, threadId: run.threadId, ...msg })
  const parse = createParser(parserKind, {
    text: (delta) => {
      if (!delta) return
      gotText = true
      emit({ type: 'text', delta })
    },
    replace: (text) => {
      gotText = true
      emit({ type: 'text', replace: text })
    },
    reset: () => emit({ type: 'text', reset: true }),
    session: (id) => {
      if (id && id !== session) {
        session = id
        emit({ type: 'session', session: id })
      }
    },
    error: (m) => (error = m),
  })
  if (session && session !== req.session) emit({ type: 'session', session })

  createInterface({ input: child.stdout! }).on('line', parse)
  let stderr = ''
  child.stderr!.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)))
  child.on('error', (e) => done(false, { error: e.message }))
  child.on('close', (code) => {
    const failed = code !== 0 && !run.cancelled
    done(!failed && !error, {
      error: failed || error ? (error ?? (stderr.trim().split('\n').slice(-6).join('\n') || `Exited with code ${code}`)) : undefined,
      empty: !gotText,
    })
  })
}

function cancelRun(runId: string) {
  const run = runs.get(runId)
  if (!run) return
  run.cancelled = true
  run.child?.kill('SIGTERM')
  setTimeout(() => run.child?.kill('SIGKILL'), 3000)
}

/* ------------------------------------------------------------------ server */

const isLocalOrigin = (origin?: string) => !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)

const readBody = (req: IncomingMessage) =>
  new Promise<string>((res, rej) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => res(b))
    req.on('error', rej)
  })

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  if (!isLocalOrigin(origin)) {
    res.writeHead(403).end()
    return
  }
  if (origin) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-headers', 'content-type')
  }
  if (req.method === 'OPTIONS') return void res.writeHead(204).end()
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, name: 'impulse-bridge', tools: TOOLS.length }))
    return
  }
  if (req.url?.startsWith('/oi?')) {
    const coin = new URL(req.url, URL_BASE).searchParams.get('coin') ?? ''
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(oiSeries(coin)))
    return
  }
  if (req.url === '/call' && req.method === 'POST') {
    if (!String(req.headers['content-type']).includes('application/json')) return void res.writeHead(415).end()
    try {
      const { run, name, args } = JSON.parse(await readBody(req)) as { run: string; name: string; args: Record<string, unknown> }
      const result = await handleCall(run, name, args ?? {})
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result }))
    } catch (e) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    }
    return
  }
  res.writeHead(404).end()
})

const wss = new WebSocketServer({ server, path: '/ws', verifyClient: ({ origin }: { origin?: string }) => isLocalOrigin(origin) })

wss.on('connection', (ws) => {
  clients.add(ws)
  send(ws, { type: 'hello', harnesses, feed, alerts: alerts.list(), smartMoney: smartMoney(), briefing, settings: { ntfyTopic: settings.ntfyTopic ?? '', customCommand: settings.customCommand ?? '' } })
  ws.on('close', () => clients.delete(ws))
  ws.on('message', async (raw) => {
    let msg: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    switch (msg.type) {
      case 'chat':
        lastActive = ws
        startRun(msg as unknown as ChatRequest, ws)
        break
      case 'cancel':
        cancelRun(String(msg.runId))
        break
      case 'tool_result': {
        const p = pendingUi.get(String(msg.callId))
        if (!p) return
        clearTimeout(p.timer)
        pendingUi.delete(String(msg.callId))
        if (msg.ok) p.resolve(msg.result)
        else p.reject(new Error(String(msg.error ?? 'UI tool failed')))
        break
      }
      case 'settings':
        settings = { ...settings, ...(msg.settings ?? {}) }
        alerts.ntfyTopic = settings.ntfyTopic ?? ''
        writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
        break
      case 'detect':
        harnesses = await detectHarnesses()
        broadcast({ type: 'harnesses', harnesses })
        break
      case 'delete_alert':
        alerts.remove(String(msg.id))
        break
      case 'test_notification':
        alerts.ntfyTopic &&
          void fetch(`https://ntfy.sh/${encodeURIComponent(alerts.ntfyTopic)}`, { method: 'POST', headers: { Title: 'Impulse' }, body: 'Phone notifications are working.' })
        break
    }
  })
})

harnesses = await detectHarnesses()
server.listen(PORT, HOST, () => {
  const found = harnesses.filter((h) => h.installed).map((h) => h.name)
  console.log(`\n  ⚡ Impulse bridge on ${URL_BASE}`)
  console.log(`     harnesses: ${found.length ? found.join(', ') : 'none found — install Claude Code, Codex, Grok, Gemini, pi, …'}\n`)
})
alerts.start()
startOiRecorder(DATA_DIR)
if (process.env.IMPULSE_SMART_MONEY !== '0') startSmartMoney()
