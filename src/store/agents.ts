import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { deferredStorage } from '@/lib/storage'

/**
 * A custom agent is Impulse with a persona: a name, a glyph and colour for its avatar, and instructions that
 * are added to Impulse's system prompt for every reply it writes. It keeps all of Impulse's tools.
 */
export interface Agent {
  id: string
  name: string
  /** One emoji or up to two characters, shown in the avatar. Empty uses the Impulse mark. */
  glyph: string
  /** Avatar background, as a hex colour. */
  color: string
  /** Extra instructions appended to the system prompt. Empty for the built-in agent. */
  prompt: string
  createdAt: number
}

export const IMPULSE_AGENT_ID = 'impulse'

/** The built-in agent: plain Impulse, no extra instructions. Always present, can't be edited or deleted. */
export const IMPULSE_AGENT: Agent = { id: IMPULSE_AGENT_ID, name: 'Impulse', glyph: '', color: '#d6407a', prompt: '', createdAt: 0 }

export const AGENT_COLORS = ['#d6407a', '#e5484d', '#f76b15', '#e2a336', '#30a46c', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#6e6e78']
export const AGENT_GLYPHS = ['🦉', '🐻', '🐂', '🦈', '🦊', '🐺', '🧠', '⚡', '🔥', '🌙', '🛰️', '📈', '📉', '🎯', '🧪', '💎']

/** Instructions are sent with every message; keep them to a sensible size. */
export const AGENT_PROMPT_MAX = 4000

/** Glyphs are one grapheme (an emoji, even a multi-codepoint one) or up to two characters. */
export function cleanGlyph(s: string) {
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s.trim())].map((g) => g.segment)
  if (!parts.length) return ''
  return /\p{Extended_Pictographic}/u.test(parts[0]) ? parts[0] : parts.slice(0, 2).join('')
}

const uid = () => Math.random().toString(36).slice(2, 10)

interface AgentsState {
  agents: Agent[]
  /** Agent new chats start with. */
  defaultAgent: string
  create: (a?: Partial<Omit<Agent, 'id' | 'createdAt'>>) => Agent
  update: (id: string, patch: Partial<Omit<Agent, 'id' | 'createdAt'>>) => void
  remove: (id: string) => void
  setDefault: (id: string) => void
}

export const useAgents = create<AgentsState>()(
  persist(
    (set, get) => ({
      agents: [],
      defaultAgent: IMPULSE_AGENT_ID,
      create(a = {}) {
        const n = get().agents.length
        const agent: Agent = {
          id: uid(),
          name: a.name?.trim() || `Agent ${n + 1}`,
          glyph: cleanGlyph(a.glyph ?? AGENT_GLYPHS[n % AGENT_GLYPHS.length]),
          color: a.color ?? AGENT_COLORS[(n + 1) % AGENT_COLORS.length],
          prompt: (a.prompt ?? '').slice(0, AGENT_PROMPT_MAX),
          createdAt: Date.now(),
        }
        set({ agents: [...get().agents, agent] })
        return agent
      },
      update(id, patch) {
        if (id === IMPULSE_AGENT_ID) return
        const p = { ...patch }
        if (p.glyph != null) p.glyph = cleanGlyph(p.glyph)
        if (p.prompt != null) p.prompt = p.prompt.slice(0, AGENT_PROMPT_MAX)
        // Not trimmed here: this runs on every keystroke. The editor tidies the name on blur.
        if (p.name != null) p.name = p.name.slice(0, 40)
        set({ agents: get().agents.map((a) => (a.id === id ? { ...a, ...p } : a)) })
      },
      remove(id) {
        set({ agents: get().agents.filter((a) => a.id !== id), defaultAgent: get().defaultAgent === id ? IMPULSE_AGENT_ID : get().defaultAgent })
      },
      setDefault: (defaultAgent) => set({ defaultAgent }),
    }),
    { name: 'impulse.agents', storage: deferredStorage(), partialize: (s) => ({ agents: s.agents, defaultAgent: s.defaultAgent }) },
  ),
)

/** Every agent, the built-in one first. */
export const useAgentList = () => {
  const agents = useAgents((s) => s.agents)
  return [IMPULSE_AGENT, ...agents]
}

/** Resolve an agent id; deleted or missing agents fall back to Impulse. */
export function agentById(id: string | undefined): Agent {
  if (!id || id === IMPULSE_AGENT_ID) return IMPULSE_AGENT
  return useAgents.getState().agents.find((a) => a.id === id) ?? IMPULSE_AGENT
}

/** Same as `agentById`, re-rendering when that agent is edited. */
export function useAgent(id: string | undefined): Agent {
  return useAgents((s) => (!id || id === IMPULSE_AGENT_ID ? IMPULSE_AGENT : (s.agents.find((a) => a.id === id) ?? IMPULSE_AGENT)))
}
