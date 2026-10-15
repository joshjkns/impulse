import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const WIDGET_KINDS = [
  'price_oi',
  'orderbook_heatmap',
  'funding',
  'volume_profile',
  'liquidations',
  'monthly_returns',
  'candles',
  'orderbook',
  'trades',
  'positions',
  'note',
] as const
export type WidgetKind = (typeof WIDGET_KINDS)[number]

export const WIDGET_META: Record<WidgetKind, { title: (sym: string) => string; subtitle: (sym: string) => string }> = {
  price_oi: {
    title: (s) => `${s} price and open interest`,
    subtitle: (s) => `${s}'s price above and its open interest in dollars below, hourly over the past month.`,
  },
  orderbook_heatmap: {
    title: (s) => `${s} order book liquidity`,
    subtitle: (s) => `Dollars resting in ${s}'s order book at each price level since this widget opened.`,
  },
  funding: {
    title: (s) => `${s} funding rate`,
    subtitle: (s) => `${s}'s annualised funding averaged over each 8 hours of the past month.`,
  },
  volume_profile: {
    title: (s) => `${s} volume profile`,
    subtitle: (s) => `Where ${s} traded over the past 30 days on hourly candles, split by up and down volume.`,
  },
  liquidations: {
    title: (s) => `${s} liquidation hours`,
    subtitle: (s) => `The hours with the most ${s} liquidated over the past 3 days, marked on price.`,
  },
  monthly_returns: {
    title: (s) => `${s} monthly returns`,
    subtitle: (s) => `${s}'s return in each month since it listed on Hyperliquid.`,
  },
  candles: { title: (s) => `${s} chart`, subtitle: (s) => `${s} candles, live.` },
  orderbook: { title: (s) => `${s} order book`, subtitle: (s) => `Live depth for ${s}.` },
  trades: { title: (s) => `${s} trades`, subtitle: (s) => `Live tape for ${s}.` },
  positions: { title: () => 'Positions', subtitle: () => 'Your open positions across all markets.' },
  note: { title: () => 'Note', subtitle: () => '' },
}

export interface Widget {
  id: string
  kind: WidgetKind
  coin: string
  title: string
  subtitle: string
  /** Agent-provided markdown for `note` widgets. */
  body?: string
  /** "drawing" while the agent is still building it — shows the pulse placeholder. */
  status: 'drawing' | 'ready'
}

export interface GridItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export type Tab =
  | { id: string; kind: 'market'; coin: string }
  | { id: string; kind: 'custom'; title: string; widgets: Widget[]; layout: GridItem[]; autoLayout: boolean; threadId?: string }

/** The custom grid is always 12 x 12 units; rowHeight is derived from the available height. */
export const GRID_COLS = 12
export const GRID_ROWS = 12

/** Even, row-major tiling: 1 → full, 2 → halves, 3-4 → 2x2, 5-6 → 3x2, 7-9 → 3x3. */
export function autoLayout(ids: string[]): GridItem[] {
  const n = ids.length
  if (!n) return []
  const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4
  const rows = Math.ceil(n / cols)
  const h = Math.floor(GRID_ROWS / rows)
  return ids.map((i, k) => {
    const r = Math.floor(k / cols)
    const inRow = r === rows - 1 ? n - r * cols : cols
    const c = k % cols
    const w = Math.floor(GRID_COLS / inRow)
    const x = c * w
    return { i, x, y: r * h, w: c === inRow - 1 ? GRID_COLS - x : w, h: r === rows - 1 ? GRID_ROWS - r * h : h }
  })
}

const uid = () => Math.random().toString(36).slice(2, 10)

interface WorkspacesState {
  tabs: Tab[]
  active: string
  setActive: (id: string) => void
  openMarket: (coin: string) => string
  createCustom: (title: string, threadId?: string) => string
  rename: (id: string, title: string) => void
  close: (id: string) => void
  reorder: (ids: string[]) => void
  addWidget: (tabId: string, w: Omit<Widget, 'id' | 'title' | 'subtitle' | 'status'> & Partial<Widget>) => Widget
  updateWidget: (tabId: string, widgetId: string, patch: Partial<Widget>) => void
  removeWidget: (tabId: string, widgetId: string) => void
  setLayout: (tabId: string, layout: GridItem[]) => void
  duplicate: (tabId: string) => string | undefined
}

const DEFAULT_TABS: Tab[] = [
  { id: 'btc', kind: 'market', coin: 'BTC' },
  { id: 'near', kind: 'market', coin: 'NEAR' },
  { id: 'zec', kind: 'market', coin: 'ZEC' },
  { id: 'sp500', kind: 'market', coin: 'xyz:SP500' },
  { id: 'cl', kind: 'market', coin: 'xyz:CL' },
]

export const useWorkspaces = create<WorkspacesState>()(
  persist(
    (set, get) => {
      const patchCustom = (id: string, fn: (t: Extract<Tab, { kind: 'custom' }>) => Partial<Extract<Tab, { kind: 'custom' }>>) =>
        set({ tabs: get().tabs.map((t) => (t.id === id && t.kind === 'custom' ? { ...t, ...fn(t) } : t)) })
      return {
        tabs: DEFAULT_TABS,
        active: 'cl',
        setActive: (active) => set({ active }),
        openMarket(coin) {
          const hit = get().tabs.find((t) => t.kind === 'market' && t.coin === coin)
          if (hit) {
            set({ active: hit.id })
            return hit.id
          }
          const id = uid()
          set({ tabs: [...get().tabs, { id, kind: 'market', coin }], active: id })
          return id
        },
        createCustom(title, threadId) {
          const id = uid()
          set({ tabs: [...get().tabs, { id, kind: 'custom', title, widgets: [], layout: [], autoLayout: true, threadId }], active: id })
          return id
        },
        rename: (id, title) => patchCustom(id, () => ({ title })),
        close(id) {
          const tabs = get().tabs
          const idx = tabs.findIndex((t) => t.id === id)
          const next = tabs.filter((t) => t.id !== id)
          set({ tabs: next, active: get().active === id ? (next[Math.max(0, idx - 1)]?.id ?? '') : get().active })
        },
        reorder(ids) {
          // Drag events can carry a stale id list while a tab is being inserted; never drop tabs.
          const tabs = get().tabs
          const map = new Map(tabs.map((t) => [t.id, t]))
          const ordered = ids.map((i) => map.get(i)).filter((t): t is Tab => !!t)
          set({ tabs: [...ordered, ...tabs.filter((t) => !ids.includes(t.id))] })
        },
        addWidget(tabId, w) {
          const sym = w.coin.includes(':') ? w.coin.split(':')[1] : w.coin
          const widget: Widget = {
            id: w.id ?? uid(),
            kind: w.kind,
            coin: w.coin,
            title: w.title ?? WIDGET_META[w.kind].title(sym),
            subtitle: w.subtitle ?? WIDGET_META[w.kind].subtitle(sym),
            body: w.body,
            status: w.status ?? 'ready',
          }
          patchCustom(tabId, (t) => {
            const widgets = [...t.widgets, widget]
            const layout = t.autoLayout
              ? autoLayout(widgets.map((x) => x.id))
              : [...t.layout, { i: widget.id, x: 0, y: GRID_ROWS, w: 6, h: 6 }]
            return { widgets, layout }
          })
          return widget
        },
        updateWidget: (tabId, wid, patch) =>
          patchCustom(tabId, (t) => ({ widgets: t.widgets.map((w) => (w.id === wid ? { ...w, ...patch } : w)) })),
        removeWidget: (tabId, wid) =>
          patchCustom(tabId, (t) => {
            const widgets = t.widgets.filter((w) => w.id !== wid)
            return { widgets, layout: t.autoLayout ? autoLayout(widgets.map((w) => w.id)) : t.layout.filter((l) => l.i !== wid) }
          }),
        setLayout: (tabId, layout) => patchCustom(tabId, () => ({ layout, autoLayout: false })),
        duplicate(tabId) {
          const t = get().tabs.find((x) => x.id === tabId)
          if (!t || t.kind !== 'custom') return
          const id = uid()
          set({ tabs: [...get().tabs, { ...t, id, title: `${t.title} copy`, threadId: undefined }], active: id })
          return id
        },
      }
    },
    {
      name: 'impulse.workspaces',
      storage: createJSONStorage(() => localStorage),
      // Widgets that were mid-draw when the page closed are finished on reload.
      onRehydrateStorage: () => (s) => {
        s?.tabs.forEach((t) => t.kind === 'custom' && t.widgets.forEach((w) => (w.status = 'ready')))
      },
    },
  ),
)
