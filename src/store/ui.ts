import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { deferredStorage } from '@/lib/storage'

export interface AppNotification {
  id: string
  title: string
  body: string
  at: number
  kind?: 'alert' | 'order' | 'info'
}

/**
 * Chat surface modes:
 *  - closed: no chat visible
 *  - modal: large centered window (first open, history browser)
 *  - docked: right-hand panel inside the workspace (after a request starts building widgets)
 */
export type SettingsPage = 'wallet' | 'accounts' | 'trading' | 'display' | 'notifications' | 'agents' | 'agent' | 'integrations' | 'data'

export type ChatMode = 'closed' | 'modal' | 'docked'

interface UIState {
  commandOpen: boolean
  commandSeed: string
  chatMode: ChatMode
  settingsOpen: boolean
  settingsPage: SettingsPage
  openSettings: (open?: boolean, page?: SettingsPage) => void
  /** Agent selected on Settings → Agents. */
  agentEditing?: string
  /** Open Settings → Agents with this agent selected. */
  editAgent: (id: string) => void
  /** A watched address shown instead of the connected wallet (session only; trading disabled). */
  watching?: `0x${string}`
  watch: (address?: `0x${string}`) => void
  notifications: AppNotification[]
  openCommand: (seed?: string) => void
  closeCommand: () => void
  setChatMode: (m: ChatMode) => void
  notify: (n: Omit<AppNotification, 'id' | 'at'>) => void
  dismiss: (id: string) => void
}

export const useUI = create<UIState>((set, get) => ({
  commandOpen: false,
  commandSeed: '',
  chatMode: 'closed',
  settingsOpen: false,
  settingsPage: 'wallet',
  openSettings: (settingsOpen = true, page) => set(page ? { settingsOpen, settingsPage: page } : { settingsOpen }),
  editAgent: (agentEditing) => set({ agentEditing, settingsOpen: true, settingsPage: 'agents' }),
  watch: (watching) => set({ watching }),
  notifications: [],
  openCommand: (seed = '') => set({ commandOpen: true, commandSeed: seed }),
  closeCommand: () => set({ commandOpen: false }),
  setChatMode: (chatMode) => set({ chatMode }),
  notify: (n) => {
    const id = Math.random().toString(36).slice(2)
    set({ notifications: [{ ...n, id, at: Date.now() }, ...get().notifications].slice(0, 4) })
    setTimeout(() => get().dismiss(id), 9000)
  },
  dismiss: (id) => set({ notifications: get().notifications.filter((n) => n.id !== id) }),
}))

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const CHAT_MIN = { w: 380, h: 420 }
export const DOCK_MIN = 260
export const DOCK_DEFAULT = 300

/** Where the floating chat window sits and how wide the docked panel is. Remembered across launches. */
export const useChatLayout = create<{
  /** Floating window bounds; unset means centred at the default size. */
  rect?: Rect
  dockW: number
  /** Set when the docked panel is dragged out: the window opens under the pointer and keeps following it. */
  pendingDrag?: { x: number; y: number }
  set: (p: Partial<{ rect?: Rect; dockW: number; pendingDrag?: { x: number; y: number } }>) => void
}>()(
  persist((set) => ({ dockW: DOCK_DEFAULT, set: (p) => set(p) }), {
    name: 'impulse.chat.layout',
    storage: deferredStorage(),
    partialize: (s) => ({ rect: s.rect, dockW: s.dockW }),
  }),
)

export function defaultChatRect(): Rect {
  const w = Math.min(1020, Math.round(window.innerWidth * 0.92))
  const h = Math.min(680, Math.round(window.innerHeight * 0.86))
  return { x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2), w, h }
}

/** Keeps a window on screen: no bigger than the viewport, and fully inside it. */
export function clampRect(r: Rect): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.max(Math.min(CHAT_MIN.w, vw - 16), Math.min(r.w, vw - 16))
  const h = Math.max(Math.min(CHAT_MIN.h, vh - 16), Math.min(r.h, vh - 16))
  return { w, h, x: Math.min(Math.max(8, r.x), vw - w - 8), y: Math.min(Math.max(8, r.y), vh - h - 8) }
}
