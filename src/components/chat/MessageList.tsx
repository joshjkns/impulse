import { Bell, Check, ChevronRight, Globe, LineChart, Loader2, X, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { OrderProposal } from '@/components/chat/OrderProposal'
import { cn } from '@/lib/utils'
import type { Message, Step, Thread } from '@/store/chat'
import { Bubble, TypingBubble } from './Bubble'
import { fmtClock } from '@/lib/format'
import { useProviderName } from './ModelPicker'
import { RichText } from './RichText'

const ALERT_ICON = { bell: Bell, globe: Globe, chart: LineChart, bolt: Zap }

function dayLabel(t: number) {
  const d = new Date(t)
  const today = new Date()
  const time = fmtClock(t)
  if (d.toDateString() === today.toDateString()) return `Today ${time}`
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`
}

export function MessageList({ thread, compact }: { thread?: Thread; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  const last = thread?.messages[thread.messages.length - 1]
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread?.messages.length, last?.text, last?.steps.length, last?.status])

  if (!thread || !thread.messages.length) return <div className="flex-1" />
  return (
    <div className={cn('flex-1 overflow-y-auto no-scrollbar', compact ? 'px-3 pt-2' : 'px-6 pt-3')}>
      <div className="mx-auto flex max-w-[640px] flex-col gap-2 pb-3">
        <div className="mb-1 text-center text-[11px] text-fg-3">{dayLabel(thread.messages[0].createdAt)}</div>
        {thread.messages.map((m, i) => (
          <MessageView key={m.id} m={m} prev={thread.messages[i - 1]} showModel={m.role === 'assistant' && !!m.harness && changedModel(thread.messages, i)} />
        ))}
        <div ref={end} />
      </div>
    </div>
  )
}

/** True when reply `i` ran on a different provider/model than the reply before it (or is the first). */
function changedModel(messages: Message[], i: number) {
  for (let k = i - 1; k >= 0; k--) {
    const p = messages[k]
    if (p.role === 'assistant' && p.harness) return p.harness !== messages[i].harness || p.model !== messages[i].model
  }
  return true
}

function ModelCaption({ m }: { m: Message }) {
  const name = useProviderName()
  return (
    <div className="mr-auto flex items-center gap-1 text-[10.5px] text-fg-3">
      <span>{name(m.harness!)}</span>
      <span>·</span>
      <span>{m.model || 'default model'}</span>
    </div>
  )
}

function MessageView({ m, prev, showModel }: { m: Message; prev?: Message; showModel?: boolean }) {
  if (m.role === 'user')
    return (
      <div className={cn(prev?.role === 'user' ? 'mt-0' : 'mt-1')}>
        <Bubble side="user">{m.text}</Bubble>
      </div>
    )
  const alerts = m.steps.filter((s) => s.name === 'create_alert' && s.status === 'done' && s.result)
  const working = m.status === 'working'
  return (
    <div className="flex flex-col gap-1.5">
      {showModel && <ModelCaption m={m} />}
      {(m.steps.length > 0 || working) && <StepsLine m={m} />}
      <AnimatePresence initial={false}>{working && !m.text && <TypingBubble key="typing" />}</AnimatePresence>
      {(m.text || alerts.length > 0) && (
        <Bubble side="agent" tail={!m.orders?.length}>
          {alerts.length > 0 ? (
            // Alert replies read: confirmation · cards · closing line.
            (() => {
              const [head, ...rest] = m.text.trim().split(/\n{2,}/)
              return (
                <>
                  {head && <RichText text={head} />}
                  <div className={cn('space-y-1.5', head && 'mt-2')}>
                    {alerts.map((s) => (
                      <AlertCard key={s.id} step={s} />
                    ))}
                  </div>
                  {rest.length > 0 && (
                    <div className="mt-2">
                      <RichText text={rest.join('\n\n')} />
                    </div>
                  )}
                </>
              )
            })()
          ) : (
            m.text && <RichText text={m.text} />
          )}
        </Bubble>
      )}
      {m.orders?.map((o, i) => <OrderProposal key={i} order={o} />)}
      {m.error && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mr-auto max-w-[86%] rounded-[14px] bg-down-soft/60 px-3 py-2 text-[12px] whitespace-pre-wrap text-[#ff9aa9]"
        >
          {m.error}
        </motion.div>
      )}
    </div>
  )
}

function AlertCard({ step }: { step: Step }) {
  const a = step.result as { title: string; description: string; icon?: keyof typeof ALERT_ICON }
  const Icon = ALERT_ICON[a.icon ?? 'bell'] ?? Bell
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: [0.2, 0.9, 0.1, 1] }}
      className="flex gap-2.5 rounded-[12px] bg-white/[0.05] p-2.5"
    >
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-brand text-white">
        <Icon className="size-3" strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] leading-tight font-medium text-fg">{a.title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-fg-2">{a.description}</span>
      </span>
    </motion.div>
  )
}

function StepsLine({ m }: { m: Message }) {
  const [open, setOpen] = useState(false)
  const working = m.status === 'working'
  const n = m.steps.length
  const secs = ((m.durationMs ?? 0) / 1000).toFixed(1)
  return (
    <div className="mr-auto">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[11.5px] text-fg-2 transition-colors hover:text-fg">
        {working && <Loader2 className="size-3 animate-spin" />}
        <span className="num">{working ? `Working · ${n} step${n === 1 ? '' : 's'}` : `Worked for ${secs}s · ${n} step${n === 1 ? '' : 's'}`}</span>
        <ChevronRight className={cn('size-3 transition-transform duration-150', open && 'rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.9, 0.1, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 space-y-1 border-l border-line pl-2.5">
              {m.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5 text-[11.5px] text-fg-2">
                  {s.status === 'running' ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : s.status === 'done' ? (
                    <Check className="size-3 text-up" />
                  ) : (
                    <X className="size-3 text-down" />
                  )}
                  <span className="truncate" title={s.error}>
                    {s.label}
                    {s.error && <span className="text-down"> · {s.error.slice(0, 60)}</span>}
                  </span>
                </li>
              ))}
              {!m.steps.length && <li className="text-[11.5px] text-fg-3">Thinking…</li>}
            </div>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
