import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AssetClass } from '@/lib/catalog'

/** A market scan is a saved filter over the market list. AI-created scans use the same shape. */
export interface Scan {
  id: string
  name: string
  assetClasses?: AssetClass[]
  industries?: string[]
  regions?: string[]
  coins?: string[]
  minChangePct?: number
  maxChangePct?: number
  minVolume?: number
  favoritesOnly?: boolean
  sort?: { key: SortKey; dir: 'asc' | 'desc' }
}

export type SortKey = 'name' | 'markPx' | 'changePct' | 'dayNtlVlm' | 'openInterest' | 'funding'

export const FEATURED_SCANS: Scan[] = [
  { id: 'all', name: 'All Markets' },
  { id: 'ai-semis', name: 'AI & semiconductors', industries: ['Semiconductors', 'AI'] },
  { id: 'crypto', name: 'Crypto', assetClasses: ['Crypto'] },
  { id: 'commodities', name: 'Commodities', assetClasses: ['Commodities'] },
  { id: 'indices', name: 'Indices', assetClasses: ['Indices'] },
]

const DEFAULT_SCANS: Scan[] = [
  { id: 'bullish', name: 'bullish', minChangePct: 1, sort: { key: 'changePct', dir: 'desc' } },
  { id: 'kr-semis', name: 'Korean semiconductors', regions: ['Korea'], industries: ['Semiconductors', 'Memory'] },
  { id: 'movers', name: 'Big movers', minVolume: 5e6, sort: { key: 'changePct', dir: 'desc' } },
]

export interface WatchedAccount {
  address: `0x${string}`
  label: string
}

export type MarginMode = 'isolated' | 'cross'

interface PrefsState {
  favorites: string[]
  scans: Scan[]
  activeScan: string
  showSummary: boolean
  portfolioOpen: boolean
  /** Provider (harness) new chats start on: the last one picked in the chat. */
  harness: string
  /** Model new chats start on. Unset means the provider's default from `defaultModels`. */
  model?: string
  /** Per-provider default model ('' or missing = the harness's own default). */
  defaultModels: Record<string, string>
  /** Custom model ids typed into the picker, newest first, so they show up next time. */
  recentModels: Record<string, string[]>
  ntfyTopic: string
  /* trading defaults */
  defaultLeverage: number
  defaultMarginMode: MarginMode
  defaultOrderType: 'market' | 'limit'
  /** Max slippage for market orders, in percent. */
  maxSlippagePct: number
  /** Require a second press on Place / Close before an order is sent. */
  confirmOrders: boolean
  /* display */
  priceFlash: boolean
  clock24h: boolean
  footerTicker: boolean
  reduceMotion: boolean
  /* notifications */
  alertPopups: boolean
  alertSound: boolean
  /* accounts */
  watched: WatchedAccount[]
  toggleFavorite: (coin: string) => void
  addScan: (s: Scan) => void
  removeScan: (id: string) => void
  setDefaultModel: (harness: string, model: string) => void
  rememberModel: (harness: string, model: string) => void
  set: (p: Partial<PrefsState>) => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      favorites: ['BTC', 'HYPE', 'NEAR', 'xyz:CL', 'ETH'],
      scans: DEFAULT_SCANS,
      activeScan: 'all',
      showSummary: true,
      portfolioOpen: true,
      harness: 'claude',
      model: undefined,
      defaultModels: {},
      recentModels: {},
      ntfyTopic: '',
      defaultLeverage: 6,
      defaultMarginMode: 'isolated',
      defaultOrderType: 'market',
      maxSlippagePct: 8,
      confirmOrders: false,
      priceFlash: true,
      clock24h: false,
      footerTicker: true,
      reduceMotion: false,
      alertPopups: true,
      alertSound: false,
      watched: [],
      toggleFavorite: (coin) => {
        const f = get().favorites
        set({ favorites: f.includes(coin) ? f.filter((c) => c !== coin) : [...f, coin] })
      },
      addScan: (s) => set({ scans: [...get().scans.filter((x) => x.id !== s.id), s], activeScan: s.id }),
      removeScan: (id) => set({ scans: get().scans.filter((s) => s.id !== id) }),
      setDefaultModel: (harness, model) => {
        const rest = Object.fromEntries(Object.entries(get().defaultModels).filter(([k]) => k !== harness))
        set({ defaultModels: model ? { ...rest, [harness]: model } : rest })
      },
      rememberModel: (harness, model) => {
        const list = get().recentModels[harness] ?? []
        set({ recentModels: { ...get().recentModels, [harness]: [model, ...list.filter((m) => m !== model)].slice(0, 8) } })
      },
      set: (p) => set(p),
    }),
    {
      name: 'impulse.prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // v0 had a single model override shared by every harness; it becomes that harness's default.
      migrate: (old, version) => {
        const s = old as Partial<PrefsState> & { harnessModel?: string }
        if (version < 1) {
          const { harnessModel, ...rest } = s
          return { ...rest, defaultModels: harnessModel && rest.harness ? { [rest.harness]: harnessModel } : {}, recentModels: {} }
        }
        return s
      },
    },
  ),
)
