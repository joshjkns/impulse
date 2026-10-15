import { Check, ChevronDown, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { LogoMark } from '@/components/brand/Logo'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useBridgeStore } from '@/lib/bridge'
import { cn } from '@/lib/utils'
import { IMPULSE_AGENT, IMPULSE_AGENT_ID, useAgent, useAgentList, useAgents, type Agent } from '@/store/agents'
import { useChat } from '@/store/chat'
import { useUI } from '@/store/ui'
import { useProviderName } from './ModelPicker'
import { usePrefs } from '@/store/prefs'

/** Round avatar: the agent's glyph on its colour, or the Impulse mark when it has no glyph. */
export function AgentAvatar({ size = 22, agent = IMPULSE_AGENT, className }: { size?: number; agent?: Agent; className?: string }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full text-white ring-1 ring-white/10 select-none', className)}
      style={{ width: size, height: size, background: agent.color }}
      aria-hidden
    >
      {agent.glyph ? (
        <span className="leading-none" style={{ fontSize: Math.round(size * (/\p{Extended_Pictographic}/u.test(agent.glyph) ? 0.56 : 0.44)) }}>
          {agent.glyph}
        </span>
      ) : (
        <LogoMark className="size-[62%]" strokeWidth={2.6} />
      )}
    </span>
  )
}

/** The agent replying in the active chat. */
export function useActiveAgent() {
  const id = useChat((s) => s.threads.find((t) => t.id === s.activeThread)?.agentId)
  return useAgent(id)
}

/** Opens Settings → Agents on a given agent. */
export function editAgent(id: string) {
  useUI.getState().editAgent(id)
}

/**
 * Chat header pill: who you're talking to, with a bridge status dot. Click to switch the chat's agent,
 * create one, or edit one.
 */
export function AgentSwitcher() {
  const agent = useActiveAgent()
  const agents = useAgentList()
  const setAgent = useChat((s) => s.setAgent)
  const create = useAgents((s) => s.create)
  const connected = useBridgeStore((s) => s.connected)
  const threadHarness = useChat((s) => s.threads.find((t) => t.id === s.activeThread)?.pick?.harness)
  const harness = usePrefs((s) => threadHarness ?? s.harness)
  const providerName = useProviderName()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex max-w-full min-w-0 items-center gap-2 rounded-full bg-white/[0.06] py-1 pr-2 pl-1 text-[13px] text-fg transition-colors hover:bg-white/[0.09] data-[state=open]:bg-white/[0.09]"
          title={connected ? `${agent.name} · running on ${providerName(harness)}` : 'Bridge offline'}
        >
          <AgentAvatar agent={agent} />
          <span className="truncate">{agent.name}</span>
          <span className={cn('size-1.5 shrink-0 rounded-full', connected ? 'bg-up' : 'bg-fg-3')} />
          <ChevronDown className="size-3 shrink-0 text-fg-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" collisionPadding={8} className="w-[280px] gap-0 rounded-xl border-line bg-popover p-1.5">
        <div className="px-2 pt-1 pb-1.5 text-[10.5px] font-medium tracking-wide text-fg-3 uppercase">Talk to</div>
        <div className="max-h-[300px] overflow-y-auto no-scrollbar">
          {agents.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => (setAgent(a.id), setOpen(false))}
              onKeyDown={(e) => e.key === 'Enter' && (setAgent(a.id), setOpen(false))}
              className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 outline-none hover:bg-hover focus-visible:bg-hover"
            >
              <AgentAvatar agent={a} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-fg">{a.name}</span>
                <span className="block truncate text-[11px] text-fg-3">{a.id === IMPULSE_AGENT_ID ? 'The built-in agent' : a.prompt.split('\n')[0] || 'No instructions yet'}</span>
              </span>
              {a.id !== IMPULSE_AGENT_ID && (
                <button
                  onClick={(e) => (e.stopPropagation(), setOpen(false), editAgent(a.id))}
                  className="grid size-6 shrink-0 place-items-center rounded-md text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-fg focus-visible:opacity-100"
                  aria-label={`Edit ${a.name}`}
                  title="Edit"
                >
                  <Pencil className="size-3" />
                </button>
              )}
              <Check className={cn('size-3.5 shrink-0 text-brand', a.id !== agent.id && 'invisible')} />
            </div>
          ))}
        </div>
        <div className="mt-1 border-t border-line pt-1">
          <button
            onClick={() => {
              const a = create()
              setAgent(a.id)
              setOpen(false)
              editAgent(a.id)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-fg-2 hover:bg-hover hover:text-fg"
          >
            <Plus className="size-3.5" /> New agent
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
