import { MessageSquarePlus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AgentAvatar } from '@/components/chat/Agents'
import { cn } from '@/lib/utils'
import { AGENT_COLORS, AGENT_GLYPHS, AGENT_PROMPT_MAX, IMPULSE_AGENT_ID, useAgent, useAgentList, useAgents } from '@/store/agents'
import { useChat } from '@/store/chat'
import { useUI } from '@/store/ui'
import { Group, Page, Row, Toggle } from './controls'

const PROMPT_EXAMPLE = `You're a patient swing trader. Before any trade idea, check funding and open interest, and say what would invalidate it. Keep replies to three sentences.`

/** Create and edit custom agents: a name, glyph and colour, plus instructions added to Impulse's system prompt. */
export function AgentsPage() {
  const agents = useAgentList()
  const editing = useUI((s) => s.agentEditing)
  const create = useAgents((s) => s.create)
  const selected = agents.find((a) => a.id === editing)?.id ?? agents[1]?.id ?? IMPULSE_AGENT_ID
  const select = (id: string) => useUI.setState({ agentEditing: id })

  return (
    <Page
      title="Agents"
      description="Custom agents are Impulse with your instructions on top: a persona, a strategy, a house style. Each keeps all of Impulse's tools and runs on whichever provider and model the chat uses. Pick one from the name at the top of any chat."
    >
      <div className="flex flex-wrap gap-2">
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => select(a.id)}
            className={cn(
              'flex h-9 max-w-[180px] items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[12.5px] ring-1 transition-colors',
              a.id === selected ? 'bg-white/[0.08] text-fg ring-white/15' : 'text-fg-2 ring-white/[0.06] hover:bg-white/[0.04] hover:text-fg',
            )}
          >
            <AgentAvatar agent={a} size={26} />
            <span className="truncate">{a.name || 'Untitled agent'}</span>
          </button>
        ))}
        <button
          onClick={() => select(create().id)}
          className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-fg-2 border border-dashed border-white/15 transition-colors hover:bg-white/[0.04] hover:text-fg"
        >
          <Plus className="size-3.5" /> New agent
        </button>
      </div>
      <AgentEditor key={selected} id={selected} />
    </Page>
  )
}

function AgentEditor({ id }: { id: string }) {
  const agent = useAgent(id)
  const update = useAgents((s) => s.update)
  const remove = useAgents((s) => s.remove)
  const isDefault = useAgents((s) => s.defaultAgent === id)
  const setDefault = useAgents((s) => s.setDefault)
  const builtIn = id === IMPULSE_AGENT_ID
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  const chat = () => {
    useChat.getState().newThread(id)
    const ui = useUI.getState()
    ui.openSettings(false)
    if (ui.chatMode === 'closed') ui.setChatMode(location.pathname.startsWith('/workspaces') ? 'docked' : 'modal')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <AgentAvatar agent={agent} size={56} />
        <div className="min-w-0 flex-1">
          {builtIn ? (
            <>
              <div className="text-[15px] text-fg">Impulse</div>
              <div className="mt-0.5 text-[12px] text-fg-3">The built-in agent. Create your own to give it a different name, look and instructions.</div>
            </>
          ) : (
            <input
              value={agent.name}
              onChange={(e) => update(id, { name: e.target.value })}
              onBlur={(e) => update(id, { name: e.target.value.trim() || 'Untitled agent' })}
              placeholder="Agent name"
              maxLength={40}
              aria-label="Agent name"
              className="h-9 w-full rounded-[9px] bg-field px-3 text-[15px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
            />
          )}
        </div>
        <button
          onClick={chat}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-brand px-3 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
        >
          <MessageSquarePlus className="size-3.5" /> Chat
        </button>
      </div>

      {!builtIn && (
        <>
          <Group title="Look">
            <Row label="Glyph" hint="An emoji or up to two letters. Clear it to use the Impulse mark.">
              <input
                value={agent.glyph}
                onChange={(e) => update(id, { glyph: e.target.value })}
                aria-label="Glyph"
                placeholder="—"
                className="h-8 w-14 rounded-[8px] bg-field text-center text-[15px] text-fg ring-1 ring-line outline-none placeholder:text-fg-3 focus:ring-[#3a3a42]"
              />
            </Row>
            <div className="flex flex-wrap gap-1 px-3 pb-3">
              {AGENT_GLYPHS.map((g) => (
                <button
                  key={g}
                  onClick={() => update(id, { glyph: g })}
                  className={cn('grid size-8 place-items-center rounded-[8px] text-[16px] transition-colors hover:bg-white/[0.08]', agent.glyph === g && 'bg-white/[0.1] ring-1 ring-white/20')}
                  aria-label={`Use ${g}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <Row label="Colour">
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {AGENT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => update(id, { color: c })}
                    className={cn('size-6 rounded-full ring-offset-2 ring-offset-[#18181c] transition-shadow', agent.color.toLowerCase() === c && 'ring-2 ring-white/70')}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
                <label
                  className={cn(
                    'relative size-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/20 ring-offset-2 ring-offset-[#18181c]',
                    !AGENT_COLORS.includes(agent.color.toLowerCase()) && 'ring-2 ring-white/70',
                  )}
                  style={{ background: 'conic-gradient(#e5484d, #e2a336, #30a46c, #0090ff, #8e4ec6, #e5484d)' }}
                  title="Custom colour"
                >
                  <input type="color" value={agent.color} onChange={(e) => update(id, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
            </Row>
          </Group>

          <Group
            title="Instructions"
            aside={<span className="num text-[11px] text-fg-3">{agent.prompt.length.toLocaleString()} / {AGENT_PROMPT_MAX.toLocaleString()}</span>}
          >
            <textarea
              value={agent.prompt}
              onChange={(e) => update(id, { prompt: e.target.value })}
              placeholder={PROMPT_EXAMPLE}
              rows={8}
              maxLength={AGENT_PROMPT_MAX}
              aria-label="Instructions"
              className="block w-full resize-y rounded-[12px] bg-transparent px-3.5 py-3 text-[12.5px] leading-relaxed text-fg outline-none select-text placeholder:text-fg-3"
            />
          </Group>
          <p className="-mt-3 px-1 text-[11.5px] leading-snug text-fg-3">
            Added to Impulse's system prompt for every reply this agent writes. It can change the voice, focus and format, but not how tools are used: agents can still only propose orders.
          </p>
        </>
      )}

      <Group>
        <Row label="Default for new chats" hint="New chats start with this agent. You can switch any chat from its header.">
          <Toggle checked={isDefault} onChange={(v) => setDefault(v ? id : IMPULSE_AGENT_ID)} disabled={builtIn && isDefault} label="Default for new chats" />
        </Row>
        {!builtIn && (
          <Row label="Delete agent" hint="Chats with it stay; their next replies come from Impulse.">
            <button
              onClick={() => (armed ? (remove(id), useUI.setState({ agentEditing: undefined })) : setArmed(true))}
              className={cn('flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12px] ring-1 transition-colors', armed ? 'bg-down/15 text-down ring-down/40' : 'text-fg-2 ring-line hover:text-down')}
            >
              <Trash2 className="size-3.5" /> {armed ? 'Press again to delete' : 'Delete'}
            </button>
          </Row>
        )}
      </Group>
    </div>
  )
}
