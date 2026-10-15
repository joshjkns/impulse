import { create } from 'zustand'

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
export type SettingsPage = 'wallet' | 'accounts' | 'trading' | 'display' | 'notifications' | 'agent' | 'integrations' | 'data'

export type ChatMode = 'closed' | 'modal' | 'docked'

interface UIState {
  commandOpen: boolean
  commandSeed: string
  chatMode: ChatMode
  settingsOpen: boolean
  settingsPage: SettingsPage
  openSettings: (open?: boolean, page?: SettingsPage) => void
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
