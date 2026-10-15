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

interface PrefsState {
  favorites: string[]
  scans: Scan[]
  activeScan: string
  showSummary: boolean
  portfolioOpen: boolean
  harness: string
  harnessModel: string
  ntfyTopic: string
  toggleFavorite: (coin: string) => void
  addScan: (s: Scan) => void
  removeScan: (id: string) => void
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
      harnessModel: '',
      ntfyTopic: '',
      toggleFavorite: (coin) => {
        const f = get().favorites
        set({ favorites: f.includes(coin) ? f.filter((c) => c !== coin) : [...f, coin] })
      },
      addScan: (s) => set({ scans: [...get().scans.filter((x) => x.id !== s.id), s], activeScan: s.id }),
      removeScan: (id) => set({ scans: get().scans.filter((s) => s.id !== id) }),
      set: (p) => set(p),
    }),
    { name: 'impulse.prefs', storage: createJSONStorage(() => localStorage) },
  ),
)
