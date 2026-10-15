import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { deferredStorage } from '@/lib/storage'
import { bridgeSend, useBridgeStore } from '@/lib/bridge'
import { useAccount } from '@/store/account'
import { agentById, IMPULSE_AGENT_ID, useAgents } from '@/store/agents'
import { useMarkets } from '@/store/markets'
import { usePrefs } from '@/store/prefs'
import { useUI, type ChatMode } from '@/store/ui'
import { useWorkspaces } from '@/store/workspaces'

export interface Step {
  id: string
  name: string
  label: string
  status: 'running' | 'done' | 'error'
  args?: Record<string, unknown>
  result?: unknown
  error?: string
}

export interface ProposedOrder {
  coin: string
  side: 'long' | 'short'
  usd: number
  leverage: number
  type: 'market' | 'limit'
  limitPx?: number
  takeProfit?: number
  stopLoss?: number
  reason?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  runId?: string
  status: 'queued' | 'working' | 'done' | 'error' | 'cancelled'
  steps: Step[]
  durationMs?: number
  error?: string
  orders?: ProposedOrder[]
  /** Provider and model that produced an assistant reply ('' model = the harness's own default). */
  harness?: string
  model?: string
  /** Custom agent that wrote an assistant reply (unset = Impulse). */
  agentId?: string
}

/** Provider (harness) and model a chat runs on. No model means the provider's default from Settings. */
export interface ModelPick {
  harness: string
  model?: string
}

export interface Thread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  session?: string
  /** Harness that owns `session`. */
  harness?: string
  /** Provider and model this chat runs on; unset follows the last pick (prefs). */
  pick?: ModelPick
  /** Agent replying in this chat (unset = Impulse). */
  agentId?: string
  /** Agent `session` was started with; a different agent starts a fresh session. */
  sessionAgent?: string
}

interface ChatState {
  threads: Thread[]
  activeThread?: string
  /** Messages typed while a reply is still streaming; sent in order afterwards. */
  queue: { threadId: string; text: string }[]
  send: (text: string, opts?: { surface?: ChatMode; threadId?: string; newThread?: boolean }) => Promise<void>
  cancel: (threadId?: string) => void
  /** Switch the active chat's provider/model; new chats start on it too. */
  setPick: (pick: ModelPick) => void
  newThread: (agentId?: string) => string
  /** Switch the active chat's agent (starting a chat with it if there is none). */
  setAgent: (agentId: string) => void
  selectThread: (id?: string) => void
  deleteThread: (id: string) => void
  attachOrder: (runId: string | undefined, threadId: string | undefined, o: ProposedOrder) => void
  onRunStarted: (runId: string) => void
  onStep: (runId: string, step: Step) => void
  onText: (runId: string, e: { delta?: string; replace?: string; reset?: boolean }) => void
  onSession: (runId: string, session: string) => void
  onDone: (runId: string, e: { ok: boolean; error?: string; durationMs: number; cancelled?: boolean; empty?: boolean }) => void
  onDisconnected: () => void
}

const uid = () => Math.random().toString(36).slice(2, 10)

/** The provider/model a thread will run on next. */
export function resolvePick(thread?: Thread): ModelPick {
  if (thread?.pick) return thread.pick
  const { harness, model } = usePrefs.getState()
  return { harness, model }
}

/** The concrete model id for a pick: its own, else the provider default ('' = the harness decides). */
export function effectiveModel(pick: ModelPick) {
  return pick.model ?? usePrefs.getState().defaultModels[pick.harness] ?? ''
}

/** Short description of where the user is, so the agent can resolve "this market". */
function context() {
  const path = window.location.pathname
  const ws = useWorkspaces.getState()
  const tab = ws.tabs.find((t) => t.id === ws.active)
  const acct = useAccount.getState()
  const parts = [`today is ${new Date().toDateString()}`]
  if (path.startsWith('/workspaces') && tab) {
    if (tab.kind === 'market') parts.push(`user is viewing the ${useMarkets.getState().markets[tab.coin]?.name ?? tab.coin} (${tab.coin}) trading workspace`)
    else parts.push(`user is viewing workspace "${tab.title}" (id ${tab.id}) with ${tab.widgets.length} widgets`)
  } else if (path === '/') parts.push('user is on the Home market overview')
  parts.push(acct.address ? `wallet connected, portfolio $${acct.portfolioValue.toFixed(2)}, ${acct.positions.length} open positions` : 'no wallet connected')
  return parts.join('; ')
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => {
      const patchMsg = (runId: string, fn: (m: Message, t: Thread) => Partial<Message>) =>
        set({
          threads: get().threads.map((t) =>
            t.messages.some((m) => m.runId === runId)
              ? { ...t, updatedAt: Date.now(), messages: t.messages.map((m) => (m.runId === runId ? { ...m, ...fn(m, t) } : m)) }
              : t,
          ),
        })
      const threadOfRun = (runId: string) => get().threads.find((t) => t.messages.some((m) => m.runId === runId))
      const isBusy = (threadId: string) =>
        get().threads.find((t) => t.id === threadId)?.messages.some((m) => m.role === 'assistant' && m.status === 'working') ?? false

      const dispatch = (threadId: string, text: string) => {
        const thread = get().threads.find((t) => t.id === threadId)
        if (!thread) return
        const pick = resolvePick(thread)
        const { harness } = pick
        const model = effectiveModel(pick)
        const agent = agentById(thread.agentId)
        const runId = uid()
        const now = Date.now()
        const user: Message = { id: uid(), role: 'user', text, createdAt: now, status: 'done', steps: [] }
        const asst: Message = { id: uid(), role: 'assistant', text: '', createdAt: now, runId, status: 'working', steps: [], harness, model, agentId: agent.id }
        const history = thread.messages
          .filter((m) => m.text && m.status !== 'queued')
          .slice(-12)
          .map((m) => ({ role: m.role, text: m.text }))
        // A harness or agent switch mid-thread starts a fresh session (the transcript carries the context over),
        // so a resumed session never keeps the previous persona's instructions.
        const session = thread.harness === harness && (thread.sessionAgent ?? IMPULSE_AGENT_ID) === agent.id ? thread.session : undefined
        set({
          threads: get().threads.map((t) =>
            t.id === threadId
              ? { ...t, harness, session, sessionAgent: agent.id, pick, updatedAt: now, title: t.messages.length ? t.title : text.slice(0, 48), messages: [...t.messages, user, asst] }
              : t,
          ),
        })
        const ok = bridgeSend({
          type: 'chat',
          threadId,
          runId,
          prompt: text,
          harness,
          model: model || undefined,
          session,
          history,
          context: context(),
          // Custom agents: a persona and instructions layered on Impulse's own system prompt.
          agent: agent.id !== IMPULSE_AGENT_ID ? { name: agent.name, prompt: agent.prompt } : undefined,
        })
        if (!ok)
          get().onDone(runId, {
            ok: false,
            durationMs: 0,
            error: 'The Impulse bridge is not running. Start it with `pnpm bridge` (or `pnpm dev`) so Impulse can use your local AI harness.',
          })
      }

      return {
        threads: [],
        queue: [],
        async send(text, opts = {}) {
          const t = text.trim()
          if (!t) return
          let threadId = opts.threadId ?? get().activeThread
          if (opts.newThread || !threadId || !get().threads.some((x) => x.id === threadId)) threadId = get().newThread()
          set({ activeThread: threadId })
          const ui = useUI.getState()
          if (opts.surface && ui.chatMode !== 'docked') ui.setChatMode(opts.surface)
          else if (ui.chatMode === 'closed') ui.setChatMode('modal')
          if (isBusy(threadId)) {
            set({ queue: [...get().queue, { threadId, text: t }] })
            return
          }
          dispatch(threadId, t)
        },
        cancel(threadId = get().activeThread) {
          const t = get().threads.find((x) => x.id === threadId)
          const m = t?.messages.find((x) => x.status === 'working')
          if (m?.runId) bridgeSend({ type: 'cancel', runId: m.runId })
          set({ queue: get().queue.filter((q) => q.threadId !== threadId) })
        },
        setPick(pick) {
          usePrefs.getState().set({ harness: pick.harness, model: pick.model })
          const id = get().activeThread
          if (id) set({ threads: get().threads.map((t) => (t.id === id ? { ...t, pick } : t)) })
        },
        newThread(agentId = useAgents.getState().defaultAgent) {
          const id = uid()
          const agent = agentById(agentId).id
          set({
            threads: [{ id, title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [], agentId: agent === IMPULSE_AGENT_ID ? undefined : agent }, ...get().threads],
            activeThread: id,
          })
          return id
        },
        setAgent(agentId) {
          const id = get().activeThread
          if (!id || !get().threads.some((t) => t.id === id)) return void get().newThread(agentId)
          const agent = agentId === IMPULSE_AGENT_ID ? undefined : agentId
          set({ threads: get().threads.map((t) => (t.id === id ? { ...t, agentId: agent } : t)) })
        },
        selectThread: (activeThread) => set({ activeThread }),
        deleteThread: (id) =>
          set({ threads: get().threads.filter((t) => t.id !== id), activeThread: get().activeThread === id ? undefined : get().activeThread }),
        attachOrder(runId, threadId, o) {
          if (runId && threadOfRun(runId)) patchMsg(runId, (m) => ({ orders: [...(m.orders ?? []), o] }))
          else if (threadId)
            set({
              threads: get().threads.map((t) =>
                t.id === threadId
                  ? { ...t, messages: [...t.messages, { id: uid(), role: 'assistant', text: '', createdAt: Date.now(), status: 'done', steps: [], orders: [o] }] }
                  : t,
              ),
            })
        },
        onRunStarted: () => undefined,
        onStep: (runId, step) =>
          patchMsg(runId, (m) => {
            const i = m.steps.findIndex((s) => s.id === step.id)
            return { steps: i < 0 ? [...m.steps, step] : m.steps.map((s, k) => (k === i ? step : s)) }
          }),
        onText: (runId, e) =>
          patchMsg(runId, (m) => {
            if (e.reset) return { text: '' }
            if (e.replace != null) return { text: e.replace }
            return { text: m.text + (e.delta ?? '') }
          }),
        onSession: (runId, session) => {
          const t = threadOfRun(runId)
          if (t) set({ threads: get().threads.map((x) => (x.id === t.id ? { ...x, session } : x)) })
        },
        onDone(runId, e) {
          const t = threadOfRun(runId)
          patchMsg(runId, (m) => ({
            status: e.cancelled ? 'cancelled' : e.ok ? 'done' : 'error',
            durationMs: e.durationMs,
            text: m.text.trim(),
            error: e.ok ? undefined : (e.error ?? (e.cancelled ? undefined : 'The harness exited without a reply')),
            steps: m.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error' as const } : s)),
          }))
          if (!t) return
          const next = get().queue.find((q) => q.threadId === t.id)
          if (next) {
            set({ queue: get().queue.filter((q) => q !== next) })
            setTimeout(() => dispatch(t.id, next.text), 120)
          }
        },
        onDisconnected() {
          for (const t of get().threads)
            for (const m of t.messages)
              if (m.status === 'working' && m.runId) get().onDone(m.runId, { ok: false, durationMs: Date.now() - m.createdAt, error: 'Lost connection to the Impulse bridge' })
        },
      }
    },
    {
      name: 'impulse.chat',
      storage: deferredStorage(),
      // Tool results can be large market-data payloads; only alert cards are rendered from them later.
      partialize: (s) => ({
        threads: s.threads.slice(0, 50).map((t) => ({
          ...t,
          messages: t.messages.map((m) =>
            m.steps.some((x) => x.result !== undefined && x.name !== 'create_alert')
              ? { ...m, steps: m.steps.map((x) => (x.name === 'create_alert' ? x : { ...x, result: undefined, args: undefined })) }
              : m,
          ),
        })),
        activeThread: s.activeThread,
      }),
      onRehydrateStorage: () => (s) =>
        s?.threads.forEach((t) => t.messages.forEach((m) => m.status === 'working' && ((m.status = 'error'), (m.error = 'Interrupted')))),
    },
  ),
)

export const useBridgeConnected = () => useBridgeStore((s) => s.connected)
