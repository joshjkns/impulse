import { ChevronLeft, Plus, Search, SquarePen, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router'
import { LogoMark } from '@/components/brand/Logo'
import { useBridgeStore } from '@/lib/bridge'
import { cn } from '@/lib/utils'
import { useChat } from '@/store/chat'
import { usePrefs } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { useProviderName } from './ModelPicker'

const SURFACE = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 } as const
const EASE = [0.2, 0.9, 0.1, 1] as const
const DOCK_W = 300

export function AgentAvatar({ size = 22 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-[#d6407a] text-white ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      <LogoMark className="size-[62%]" strokeWidth={2.6} />
    </span>
  )
}

function AgentPill() {
  const threadHarness = useChat((s) => s.threads.find((t) => t.id === s.activeThread)?.pick?.harness)
  const harness = usePrefs((s) => threadHarness ?? s.harness)
  const connected = useBridgeStore((s) => s.connected)
  const name = useProviderName()
  return (
    <span className="flex items-center gap-2 rounded-full bg-white/[0.06] py-1 pr-3 pl-1 text-[13px] text-fg" title={connected ? `Running on ${name(harness)}` : 'Bridge offline'}>
      <AgentAvatar />
      Impulse
      <span className={cn('size-1.5 rounded-full', connected ? 'bg-up' : 'bg-fg-3')} />
    </span>
  )
}

function useActiveThread() {
  const threads = useChat((s) => s.threads)
  const active = useChat((s) => s.activeThread)
  const thread = threads.find((t) => t.id === active)
  const busy = !!thread?.messages.some((m) => m.status === 'working')
  return { thread, busy, threads }
}

/** Modal surface (big window) rendered at the app root. */
export function ChatHost() {
  const mode = useUI((s) => s.chatMode)
  const setMode = useUI((s) => s.setChatMode)
  const { thread, busy, threads } = useActiveThread()
  const { selectThread, newThread, deleteThread } = useChat()
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (mode !== 'modal') return
    // A popover inside (model picker, + menu) handles its own Escape and marks it defaultPrevented.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && setMode('closed')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, setMode])

  const list = useMemo(
    () => threads.filter((t) => t.messages.length && (!q || t.title.toLowerCase().includes(q.toLowerCase()))),
    [threads, q],
  )

  return (
    <AnimatePresence>
      {mode === 'modal' && (
        <motion.div key="chat-modal" className="fixed inset-0 z-40 grid place-items-center p-6">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={() => setMode('closed')}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.965, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: SURFACE }}
            exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14, ease: EASE } }}
            className="relative will-change-transform flex h-[min(680px,86vh)] w-[min(1020px,92vw)] overflow-hidden rounded-[18px] bg-[#1b1b20] shadow-[0_40px_120px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.06]"
          >
            <aside className="flex w-[226px] shrink-0 flex-col bg-[#202127] ring-1 ring-white/[0.04]">
              <div className="flex items-center gap-1 p-2.5">
                <RoundButton onClick={() => setMode('closed')} aria-label="Close">
                  <ChevronLeft className="size-4" />
                </RoundButton>
                <div className="ml-auto flex gap-1">
                  <RoundButton onClick={() => setSearching((s) => !s)} aria-label="Search">
                    <Search className="size-3.5" />
                  </RoundButton>
                  <RoundButton onClick={() => newThread()} aria-label="New chat">
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
              <div className="flex px-3 pb-3">
                <button onClick={() => newThread()} className="flex flex-col items-center gap-1">
                  <span className="rounded-full p-[3px] ring-2 ring-white/10">
                    <AgentAvatar size={42} />
                  </span>
                  <span className="text-[10.5px] text-fg-2">Impulse</span>
                </button>
              </div>
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
            <section className="relative flex min-w-0 flex-1 flex-col">
              <header className="flex h-14 shrink-0 items-center justify-center">
                <AgentPill />
              </header>
              <MessageList thread={thread} />
              {!thread?.messages.length && <EmptyState />}
              <Composer busy={busy} autoFocus />
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Docked surface: lives in the workspace's right column and slides in from the edge. */
export function DockedChat() {
  const setMode = useUI((s) => s.setChatMode)
  const { thread, busy } = useActiveThread()
  const newThread = useChat((s) => s.newThread)
  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: DOCK_W + 8, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.24, ease: EASE }}
      className="h-full shrink-0 overflow-hidden"
    >
      <motion.div
        initial={{ x: 24 }}
        animate={{ x: 0 }}
        exit={{ x: 24 }}
        transition={{ duration: 0.24, ease: EASE }}
        className="ml-2 flex h-full flex-col overflow-hidden rounded-[12px] bg-panel"
        style={{ width: DOCK_W }}
      >
        <header className="flex h-12 shrink-0 items-center gap-1 px-2">
          <RoundButton onClick={() => setMode('modal')} aria-label="All chats" title="All chats">
            <ChevronLeft className="size-4" />
          </RoundButton>
          <RoundButton onClick={() => newThread()} aria-label="New chat" title="New chat">
            <SquarePen className="size-3.5" />
          </RoundButton>
          <div className="flex flex-1 justify-center">
            <AgentPill />
          </div>
          <RoundButton onClick={() => setMode('closed')} aria-label="Close panel" title="Close">
            <X className="size-3.5" />
          </RoundButton>
        </header>
        <MessageList thread={thread} compact />
        <Composer busy={busy} compact />
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

function EmptyState() {
  const send = useChat((s) => s.send)
  const connected = useBridgeStore((s) => s.connected)
  return (
    <div className="absolute inset-x-0 top-1/2 mx-auto flex max-w-md -translate-y-1/2 flex-col items-center px-6 text-center">
      <AgentAvatar size={44} />
      <p className="mt-3 text-[13px] text-fg">Ask Impulse to research, build workspaces, or watch the market for you.</p>
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
