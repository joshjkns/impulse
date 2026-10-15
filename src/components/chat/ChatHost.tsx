import { AppWindow, PanelRightOpen, Plus, Search, SquarePen, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useBridgeStore } from '@/lib/bridge'
import { cn } from '@/lib/utils'
import { IMPULSE_AGENT_ID, useAgent, useAgentList, useAgents } from '@/store/agents'
import { useChat } from '@/store/chat'
import { CHAT_MIN, clampRect, defaultChatRect, DOCK_MIN, useChatLayout, useUI, type Rect } from '@/store/ui'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { AgentAvatar, AgentSwitcher, useActiveAgent } from './Agents'

const SURFACE = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 } as const
const EASE = [0.2, 0.9, 0.1, 1] as const

export { AgentAvatar } from './Agents'

function useActiveThread() {
  const threads = useChat((s) => s.threads)
  const active = useChat((s) => s.activeThread)
  const thread = threads.find((t) => t.id === active)
  const busy = !!thread?.messages.some((m) => m.status === 'working')
  return { thread, busy, threads }
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const EDGES: { edge: Edge; className: string }[] = [
  { edge: 'n', className: 'inset-x-4 top-0 h-1.5 cursor-ns-resize' },
  { edge: 's', className: 'inset-x-4 bottom-0 h-1.5 cursor-ns-resize' },
  { edge: 'e', className: 'inset-y-4 right-0 w-1.5 cursor-ew-resize' },
  { edge: 'w', className: 'inset-y-4 left-0 w-1.5 cursor-ew-resize' },
  { edge: 'nw', className: 'top-0 left-0 size-4 cursor-nwse-resize' },
  { edge: 'se', className: 'right-0 bottom-0 size-4 cursor-nwse-resize' },
  { edge: 'ne', className: 'top-0 right-0 size-4 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-4 cursor-nesw-resize' },
]
/** Below this width the thread list folds away so the conversation keeps its room. */
const SIDEBAR_MIN_W = 640
/** Drop the window within this many px of the right edge (on a workspace) to dock it. */
const DOCK_SNAP = 28

const isControl = (t: EventTarget) => !!(t as HTMLElement).closest('button,input,textarea,a,[role="menuitem"]')

function resizeRect(s: Rect, edge: Edge, dx: number, dy: number): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let { x, y, w, h } = s
  if (edge.includes('e')) w = Math.min(s.w + dx, vw - 8 - s.x)
  if (edge.includes('s')) h = Math.min(s.h + dy, vh - 8 - s.y)
  if (edge.includes('w')) {
    x = Math.max(8, Math.min(s.x + dx, s.x + s.w - CHAT_MIN.w))
    w = s.x + s.w - x
  }
  if (edge.includes('n')) {
    y = Math.max(8, Math.min(s.y + dy, s.y + s.h - CHAT_MIN.h))
    h = s.y + s.h - y
  }
  return { x, y, w: Math.max(CHAT_MIN.w, w), h: Math.max(CHAT_MIN.h, h) }
}

/** Pointer-driven move/resize with rAF batching; `done` gets the final rect (or nothing if it never moved). */
function track(e0: { clientX: number; clientY: number }, apply: (dx: number, dy: number, ev: PointerEvent) => void, done: (moved: boolean, ev?: PointerEvent) => void, cursor: string) {
  let frame = 0
  let moved = false
  let last: PointerEvent | undefined
  const prev = document.body.style.cursor
  document.body.style.cursor = cursor
  document.body.style.userSelect = 'none'
  const move = (ev: PointerEvent) => {
    moved = true
    last = ev
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => apply(ev.clientX - e0.clientX, ev.clientY - e0.clientY, ev))
  }
  const up = () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    document.body.style.cursor = prev
    document.body.style.userSelect = ''
    if (last) apply(last.clientX - e0.clientX, last.clientY - e0.clientY, last)
    done(moved, last)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

/** Right-hand strip the docked panel would occupy, for the drop preview. */
function dockPreviewRect(w: number) {
  const area = document.querySelector<HTMLElement>('[data-dock-area]')?.getBoundingClientRect()
  return area ? { top: area.top, height: area.height, left: area.right - w, width: w } : undefined
}

/** Floating chat window rendered at the app root: drag it by the header, resize from any edge or corner. */
export function ChatHost() {
  const mode = useUI((s) => s.chatMode)
  return <AnimatePresence>{mode === 'modal' && <ChatWindow key="chat-window" />}</AnimatePresence>
}

function ChatWindow() {
  const setMode = useUI((s) => s.setChatMode)
  const onWorkspaces = useLocation().pathname.startsWith('/workspaces')
  const setLayout = useChatLayout((s) => s.set)
  const dockW = useChatLayout((s) => s.dockW)
  const { thread, busy, threads } = useActiveThread()
  const { selectThread, newThread, deleteThread } = useChat()
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [rect, setRect] = useState<Rect>(() => {
    const { rect: saved, pendingDrag } = useChatLayout.getState()
    const r = saved ?? defaultChatRect()
    // Pulled out of the dock: open under the pointer, grabbed by the header.
    return clampRect(pendingDrag ? { ...r, x: pendingDrag.x - r.w / 2, y: pendingDrag.y - 24 } : r)
  })
  const [snap, setSnap] = useState<ReturnType<typeof dockPreviewRect>>()
  const win = useRef<HTMLDivElement>(null)

  const startMove = useCallback(
    (e0: { clientX: number; clientY: number }, start: Rect) => {
      let docking = false
      track(
        e0,
        (dx, dy, ev) => {
          setRect(clampRect({ ...start, x: start.x + dx, y: start.y + dy }))
          docking = onWorkspaces && ev.clientX >= window.innerWidth - DOCK_SNAP
          setSnap(docking ? dockPreviewRect(useChatLayout.getState().dockW) : undefined)
        },
        () => {
          setSnap(undefined)
          if (docking) {
            // Remember where it was, so popping it out again doesn't land at the edge.
            setLayout({ rect: start })
            setMode('docked')
          } else setRect((r) => (setLayout({ rect: r }), r))
        },
        'grabbing',
      )
    },
    [onWorkspaces, setLayout, setMode],
  )

  // Keep following the pointer when the docked panel was just dragged out.
  useEffect(() => {
    const pending = useChatLayout.getState().pendingDrag
    if (!pending) return
    setLayout({ pendingDrag: undefined })
    startMove({ clientX: pending.x, clientY: pending.y }, rect)
    // Mount only: `rect` is the initial position here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r))
    // A popover inside (model picker, + menu) handles its own Escape and marks it defaultPrevented.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const a = document.activeElement
      if (!a || a === document.body || win.current?.contains(a)) setMode('closed')
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [setMode])

  const onHeaderDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || isControl(e.target)) return
    e.preventDefault()
    startMove(e, rect)
  }
  const onEdgeDown = (edge: Edge) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const start = rect
    track(
      e,
      (dx, dy) => setRect(resizeRect(start, edge, dx, dy)),
      () => setRect((r) => (setLayout({ rect: r }), r)),
      getComputedStyle(e.currentTarget).cursor,
    )
  }
  const resetRect = (e: React.MouseEvent) => {
    if (isControl(e.target)) return
    const r = defaultChatRect()
    setRect(r)
    setLayout({ rect: undefined })
  }

  const list = useMemo(
    () => threads.filter((t) => t.messages.length && (!q || t.title.toLowerCase().includes(q.toLowerCase()))),
    [threads, q],
  )
  const wide = rect.w >= SIDEBAR_MIN_W

  return (
    <>
      <AnimatePresence>
        {snap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none fixed z-40 rounded-[12px] border-[1.5px] border-dashed border-brand/60 bg-brand/[0.06]"
            style={{ ...snap, width: dockW }}
          />
        )}
      </AnimatePresence>
      <motion.div
        ref={win}
        initial={{ opacity: 0, scale: 0.965, y: 12 }}
        animate={{ opacity: snap ? 0.55 : 1, scale: 1, y: 0, transition: SURFACE }}
        exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14, ease: EASE } }}
        className="fixed z-40 flex overflow-hidden rounded-[18px] bg-[#1b1b20] shadow-[0_40px_120px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.08]"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      >
        {wide && (
          <aside className="flex w-[226px] shrink-0 flex-col bg-[#202127] ring-1 ring-white/[0.04]">
            <div onPointerDown={onHeaderDown} onDoubleClick={resetRect} className="flex h-14 shrink-0 cursor-grab items-center gap-1 px-2.5 active:cursor-grabbing">
              <RoundButton onClick={() => setMode('closed')} aria-label="Close" title="Close">
                <X className="size-3.5" />
              </RoundButton>
              <div className="ml-auto flex gap-1">
                <RoundButton onClick={() => setSearching((s) => !s)} aria-label="Search" title="Search chats">
                  <Search className="size-3.5" />
                </RoundButton>
                <RoundButton onClick={() => newThread()} aria-label="New chat" title="New chat">
                  <Plus className="size-4" />
                </RoundButton>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {searching && (
                <motion.input
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 30, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search chats"
                  className="mx-2.5 mb-2 rounded-lg bg-field px-2.5 text-[12px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3"
                />
              )}
            </AnimatePresence>
            <AgentShelf activeId={thread?.agentId} onPick={(id) => newThread(id)} />
            <div className="flex-1 space-y-0.5 overflow-y-auto px-1.5 pb-2 no-scrollbar">
              {list.map((t) => (
                <div
                  key={t.id}
                  onClick={() => selectThread(t.id)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 transition-colors',
                    t.id === thread?.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]',
                  )}
                >
                  <ThreadAgent id={t.agentId} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-fg">{t.title}</div>
                    <div className="truncate text-[11px] text-fg-3">{lastLine(t)}</div>
                  </div>
                  <button
                    onClick={(e) => (e.stopPropagation(), deleteThread(t.id))}
                    className="hidden text-fg-3 group-hover:block hover:text-fg"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}
        <section className="relative flex min-w-0 flex-1 flex-col">
          <header
            onPointerDown={onHeaderDown}
            onDoubleClick={resetRect}
            title="Drag to move · double-click to reset"
            className="flex h-14 shrink-0 cursor-grab items-center gap-1 px-2.5 active:cursor-grabbing"
          >
            <div className="flex w-[60px] gap-1">
              {!wide && (
                <>
                  <RoundButton onClick={() => setMode('closed')} aria-label="Close" title="Close">
                    <X className="size-3.5" />
                  </RoundButton>
                  <RoundButton onClick={() => newThread()} aria-label="New chat" title="New chat">
                    <SquarePen className="size-3.5" />
                  </RoundButton>
                </>
              )}
            </div>
            <div className="flex flex-1 justify-center">
              <AgentSwitcher />
            </div>
            <div className="flex w-[60px] justify-end gap-1">
              {onWorkspaces && (
                <RoundButton onClick={() => setMode('docked')} aria-label="Dock to side" title="Dock to side (or drag to the right edge)">
                  <PanelRightOpen className="size-3.5" />
                </RoundButton>
              )}
            </div>
          </header>
          <MessageList thread={thread} />
          {!thread?.messages.length && <EmptyState />}
          <Composer busy={busy} autoFocus />
        </section>
        {EDGES.map(({ edge, className }) => (
          <div key={edge} onPointerDown={onEdgeDown(edge)} className={cn('absolute z-10 touch-none', className)} />
        ))}
      </motion.div>
    </>
  )
}

/** Docked surface: lives in the workspace's right column. Resize from its left edge; drag the header out to float it. */
export function DockedChat() {
  const setMode = useUI((s) => s.setChatMode)
  const { thread, busy } = useActiveThread()
  const newThread = useChat((s) => s.newThread)
  const dockW = useChatLayout((s) => s.dockW)
  const setLayout = useChatLayout((s) => s.set)
  const [resizing, setResizing] = useState(false)

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const w0 = dockW
    setResizing(true)
    track(
      e,
      (dx) => setLayout({ dockW: Math.round(Math.min(Math.max(DOCK_MIN, w0 - dx), Math.max(DOCK_MIN, Math.min(720, window.innerWidth * 0.5)))) }),
      () => setResizing(false),
      'ew-resize',
    )
  }
  const startUndock = (e: React.PointerEvent) => {
    if (e.button !== 0 || isControl(e.target)) return
    e.preventDefault()
    const x0 = e.clientX
    const y0 = e.clientY
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 24) return
      stop()
      setLayout({ pendingDrag: { x: ev.clientX, y: ev.clientY } })
      setMode('modal')
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: dockW + 8, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={resizing ? { duration: 0 } : { duration: 0.24, ease: EASE }}
      className="relative h-full shrink-0 overflow-hidden"
    >
      <div
        onPointerDown={startResize}
        title="Drag to resize"
        className={cn(
          'group absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize touch-none',
          "after:absolute after:inset-y-3 after:left-[3px] after:w-[2px] after:rounded-full after:bg-brand after:opacity-0 after:transition-opacity hover:after:opacity-60",
          resizing && 'after:opacity-100',
        )}
      />
      <motion.div
        initial={{ x: 24 }}
        animate={{ x: 0 }}
        exit={{ x: 24 }}
        transition={{ duration: 0.24, ease: EASE }}
        className="ml-2 flex h-full flex-col overflow-hidden rounded-[12px] bg-panel"
        style={{ width: dockW }}
      >
        <header
          onPointerDown={startUndock}
          title="Drag out to float"
          className="flex h-12 shrink-0 cursor-grab items-center gap-1 px-2 active:cursor-grabbing"
        >
          <RoundButton onClick={() => setMode('modal')} aria-label="Open as window" title="Open as window">
            <AppWindow className="size-3.5" />
          </RoundButton>
          <RoundButton onClick={() => newThread()} aria-label="New chat" title="New chat">
            <SquarePen className="size-3.5" />
          </RoundButton>
          <div className="flex min-w-0 flex-1 justify-center">
            <AgentSwitcher />
          </div>
          <RoundButton onClick={() => setMode('closed')} aria-label="Close panel" title="Close">
            <X className="size-3.5" />
          </RoundButton>
        </header>
        <MessageList thread={thread} compact />
        <Composer busy={busy} compact autoFocus />
      </motion.div>
    </motion.div>
  )
}

/**
 * Opens Impulse from anywhere: docks it beside the grid on workspaces, otherwise opens the big window.
 * Pressing it again closes whichever surface is showing.
 */
export function useToggleChat() {
  const onWorkspaces = useLocation().pathname.startsWith('/workspaces')
  return () => {
    const { chatMode, setChatMode } = useUI.getState()
    const visible = chatMode === 'modal' || (chatMode === 'docked' && onWorkspaces)
    setChatMode(visible ? 'closed' : onWorkspaces ? 'docked' : 'modal')
  }
}

function RoundButton({ className, ...p }: React.ComponentProps<'button'>) {
  return (
    <button
      {...p}
      className={cn(
        'grid size-7 place-items-center rounded-full text-fg-2 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.06] hover:text-fg active:scale-95',
        className,
      )}
    />
  )
}

const SUGGESTIONS = [
  'Generate market summary for WTI Crude Oil',
  'Alert me when smart money starts shorting Crude Oil',
  'What is moving in AI & semiconductors today?',
  'Build me a BTC dashboard with funding and liquidations',
]

/** Pinned agents above the chat list: click one to start a chat with it, + to create a new agent. */
function AgentShelf({ activeId, onPick }: { activeId?: string; onPick: (id: string) => void }) {
  const agents = useAgentList()
  const create = useAgents((s) => s.create)
  return (
    // pt-1: the row scrolls horizontally, which also clips vertically, and the avatar ring draws 2px outside its box.
    <div className="flex gap-2.5 overflow-x-auto px-3 pt-1 pb-3 no-scrollbar">
      {agents.map((a) => (
        <button key={a.id} onClick={() => onPick(a.id)} title={`New chat with ${a.name}`} className="flex w-[52px] shrink-0 flex-col items-center gap-1">
          <span className={cn('rounded-full p-[3px] ring-2 transition-colors', (activeId ?? IMPULSE_AGENT_ID) === a.id ? 'ring-white/25' : 'ring-white/10')}>
            <AgentAvatar size={42} agent={a} />
          </span>
          <span className="w-full truncate text-center text-[10.5px] text-fg-2">{a.name}</span>
        </button>
      ))}
      <button
        onClick={() => {
          const a = create()
          onPick(a.id)
          useUI.getState().editAgent(a.id)
        }}
        title="New agent"
        className="flex w-[52px] shrink-0 flex-col items-center gap-1 text-fg-3 hover:text-fg"
      >
        <span className="grid size-[48px] place-items-center rounded-full border border-dashed border-white/15">
          <Plus className="size-4" />
        </span>
        <span className="text-[10.5px]">New</span>
      </button>
    </div>
  )
}

/** Small avatar beside a chat in the history list; Impulse's own chats show none. */
function ThreadAgent({ id }: { id?: string }) {
  const agent = useAgent(id)
  return id ? <AgentAvatar agent={agent} size={20} /> : null
}

function EmptyState() {
  const send = useChat((s) => s.send)
  const connected = useBridgeStore((s) => s.connected)
  const agent = useActiveAgent()
  return (
    <div className="absolute inset-x-0 top-1/2 mx-auto flex max-w-md -translate-y-1/2 flex-col items-center px-6 text-center">
      <AgentAvatar size={44} agent={agent} />
      <p className="mt-3 text-[13px] text-fg">
        {agent.id === IMPULSE_AGENT_ID ? 'Ask Impulse to research, build workspaces, or watch the market for you.' : `${agent.name} is ready. It has all of Impulse's tools, plus your instructions.`}
      </p>
      {!connected && (
        <p className="mt-2 text-[11.5px] text-fg-3">
          Start the local bridge with <code className="rounded bg-white/5 px-1">pnpm bridge</code> to connect your harness.
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => void send(s)}
            className="rounded-full bg-white/[0.05] px-3 py-1.5 text-[11.5px] text-fg-2 ring-1 ring-white/[0.05] transition-colors hover:bg-white/[0.09] hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function lastLine(t: { messages: { text: string }[] }) {
  for (let i = t.messages.length - 1; i >= 0; i--) if (t.messages[i].text) return t.messages[i].text.replace(/\*\*|\[\[[^\]]+\]\]/g, '').slice(0, 60)
  return ''
}
