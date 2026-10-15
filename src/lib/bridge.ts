import { useEffect } from 'react'
import { create } from 'zustand'
import { runUiTool } from '@/lib/uiTools'
import { useChat } from '@/store/chat'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'

export const BRIDGE_WS = (import.meta.env.VITE_IMPULSE_BRIDGE as string | undefined) ?? 'ws://127.0.0.1:7420/ws'

export interface HarnessStatus {
  id: string
  name: string
  installed: boolean
  version?: string
  mcp: boolean
  homepage: string
  /** Harness accepts a model flag (older bridges omit this: assume yes). */
  modelFlag?: boolean
  /** Suggested and discovered model ids. */
  models?: string[]
}

export interface BridgeAlert {
  id: string
  title: string
  description: string
  kind: string
  coin?: string
  icon?: 'bell' | 'globe' | 'chart' | 'bolt'
  createdAt: number
  lastFiredAt?: number
}

export interface SmartMoneyCoin {
  long: number
  short: number
  traders: number
  shortDelta24h: number
  longDelta24h: number
}

export interface FeedItem {
  id: string
  title: string
  body: string
  at: number
  alertId?: string
  coin?: string
}

interface BridgeState {
  connected: boolean
  harnesses: HarnessStatus[]
  alerts: BridgeAlert[]
  smartMoney: Record<string, SmartMoneyCoin>
  briefing?: { text: string; bullets: { text: string; coin?: string }[]; at: number }
  settings: { ntfyTopic: string; customCommand: string }
  feed: FeedItem[]
}

export const useBridgeStore = create<BridgeState>(() => ({
  connected: false,
  harnesses: [],
  alerts: [],
  smartMoney: {},
  settings: { ntfyTopic: '', customCommand: '' },
  feed: loadFeed(),
}))

function loadFeed(): FeedItem[] {
  try {
    return JSON.parse(localStorage.getItem('impulse.feed') ?? '[]') as FeedItem[]
  } catch {
    return []
  }
}
function pushFeed(item: FeedItem) {
  const feed = [item, ...useBridgeStore.getState().feed].slice(0, 200)
  useBridgeStore.setState({ feed })
  try {
    localStorage.setItem('impulse.feed', JSON.stringify(feed))
  } catch {
    /* ignore */
  }
}

/** Two short sine tones; no audio asset needed. */
export function playChime() {
  try {
    const ctx = new AudioContext()
    ;[880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = f
      const t = ctx.currentTime + i * 0.12
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.15, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.26)
    })
    setTimeout(() => void ctx.close(), 600)
  } catch {
    /* audio unavailable */
  }
}

let ws: WebSocket | undefined
let retry = 0

export function bridgeSend(msg: unknown) {
  if (ws?.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify(msg))
  return true
}

type Msg = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Extra handlers for message families owned elsewhere (the browser-wallet relay). */
const listeners = new Set<(msg: Msg) => void>()
const openHooks = new Set<() => void>()
export function onBridgeMessage(fn: (msg: Msg) => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
/** Runs on every (re)connect, e.g. to re-register with the bridge. */
export function onBridgeOpen(fn: () => void) {
  openHooks.add(fn)
  if (ws?.readyState === WebSocket.OPEN) fn()
  return () => void openHooks.delete(fn)
}

function handle(msg: Msg) {
  listeners.forEach((fn) => fn(msg))
  const chat = useChat.getState()
  switch (msg.type) {
    case 'hello':
      useBridgeStore.setState({
        harnesses: msg.harnesses,
        alerts: msg.alerts,
        smartMoney: msg.smartMoney ?? {},
        briefing: msg.briefing ?? undefined,
        settings: msg.settings,
      })
      // Merge the bridge's alert history (fired while this tab was closed or elsewhere).
      if (Array.isArray(msg.feed)) {
        const have = new Set(useBridgeStore.getState().feed.map((f) => f.id))
        ;(msg.feed as FeedItem[]).filter((f) => !have.has(f.id)).forEach(pushFeed)
        useBridgeStore.setState({ feed: [...useBridgeStore.getState().feed].sort((a, b) => b.at - a.at) })
      }
      break
    case 'harnesses':
      useBridgeStore.setState({ harnesses: msg.harnesses })
      break
    case 'alerts':
      useBridgeStore.setState({ alerts: msg.alerts })
      break
    case 'smart_money':
      useBridgeStore.setState({ smartMoney: msg.data })
      break
    case 'briefing':
      useBridgeStore.setState({ briefing: msg.briefing })
      break
    case 'run_started':
      chat.onRunStarted(msg.runId)
      break
    case 'step':
      chat.onStep(msg.runId, msg.step)
      break
    case 'text':
      chat.onText(msg.runId, msg)
      break
    case 'session':
      chat.onSession(msg.runId, msg.session)
      break
    case 'run_done':
      chat.onDone(msg.runId, msg as never)
      break
    case 'tool_call':
      runUiTool(msg.name, msg.args ?? {}, { runId: msg.runId, threadId: msg.threadId }).then(
        (result) => bridgeSend({ type: 'tool_result', callId: msg.callId, ok: true, result }),
        (e: unknown) => bridgeSend({ type: 'tool_result', callId: msg.callId, ok: false, error: e instanceof Error ? e.message : String(e) }),
      )
      break
    case 'alert_fired': {
      const { alertPopups, alertSound } = usePrefs.getState()
      if (alertPopups) useUI.getState().notify({ title: msg.title, body: msg.body, kind: 'alert' })
      if (alertSound) playChime()
      pushFeed({ id: `${msg.alert.id}.${msg.at}`, title: msg.title, body: msg.body, at: msg.at, alertId: msg.alert.id, coin: msg.alert.coin })
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted')
        new Notification(msg.title, { body: msg.body, icon: '/favicon.svg' })
      break
    }
  }
}

function connect() {
  try {
    ws = new WebSocket(BRIDGE_WS)
  } catch {
    schedule()
    return
  }
  ws.onopen = () => {
    retry = 0
    useBridgeStore.setState({ connected: true })
    openHooks.forEach((fn) => fn())
  }
  ws.onmessage = (e) => {
    try {
      handle(JSON.parse(String(e.data)) as Msg)
    } catch (err) {
      console.warn('[bridge] bad message', err)
    }
  }
  ws.onclose = () => {
    useBridgeStore.setState({ connected: false })
    useChat.getState().onDisconnected()
    schedule()
  }
}

function schedule() {
  retry = Math.min(retry + 1, 6)
  setTimeout(connect, 500 * 2 ** retry)
}

let started = false
export function useBridge() {
  useEffect(() => {
    if (started) return
    started = true
    connect()
  }, [])
}
