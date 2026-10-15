import { useAccount } from '@/store/account'
import { useChat, type ProposedOrder } from '@/store/chat'
import { marketsReady, resolveCoin, useMarkets } from '@/store/markets'
import { usePrefs, type SortKey } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { findSlot, GRID_COLS, minSize, useWorkspaces, type GridItem, type Tab, type WidgetKind } from '@/store/workspaces'

/** Router escape hatch so tools (which run outside React) can navigate. Set by <NavBinder/>. */
export const nav: { go: (path: string) => void } = { go: (p) => window.history.pushState({}, '', p) }

const need = (coin: unknown) => {
  const c = resolveCoin(String(coin ?? ''))
  if (!c) throw new Error(`Unknown market "${String(coin)}"`)
  return c
}

type A = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Custom = Extract<Tab, { kind: 'custom' }>

function customTab(id: unknown): Custom {
  const tab = useWorkspaces.getState().tabs.find((t) => t.id === id)
  if (!tab) throw new Error(`Unknown workspaceId "${String(id)}"; call list_workspaces`)
  if (tab.kind !== 'custom') throw new Error(`"${String(id)}" is a market tab; only custom workspaces have widgets`)
  return tab
}

function widgetOf(tab: Custom, id: unknown) {
  const w = tab.widgets.find((x) => x.id === id)
  if (!w) throw new Error(`Unknown widgetId "${String(id)}" in workspace ${tab.id}; call list_workspaces`)
  return w
}

const overlaps = (a: Omit<GridItem, 'i'>, b: Omit<GridItem, 'i'>) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const layoutOut = (l: GridItem[]) => l.map(({ i, x, y, w, h }) => ({ widgetId: i, x, y, w, h }))

/**
 * Close vertical gaps the way the grid renders them (each widget rises until it meets another or the top), so the
 * layout a tool returns is exactly what the user sees.
 */
function compact(items: GridItem[]) {
  const done: GridItem[] = []
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const next = { ...it }
    while (next.y > 0 && !done.some((d) => overlaps(d, { ...next, y: next.y - 1 }))) next.y--
    done.push(next)
  }
  return done
}

/**
 * Place the requested widgets in order (clamped to their minimum size and the grid width; one that would overlap
 * an earlier one moves down until it fits), then keep every other widget where it was if that spot is free,
 * else give it the first free slot.
 */
function arrange(tab: Custom, entries: { widgetId: string; x: number; y: number; w: number; h: number }[]) {
  const placed: GridItem[] = []
  for (const e of entries) {
    const widget = widgetOf(tab, e.widgetId)
    if (placed.some((p) => p.i === widget.id)) continue
    const min = minSize(widget.kind)
    const w = Math.min(GRID_COLS, Math.max(min.minW, Math.round(e.w)))
    const h = Math.max(min.minH, Math.round(e.h))
    const item = { i: widget.id, x: Math.max(0, Math.min(Math.round(e.x), GRID_COLS - w)), y: Math.max(0, Math.round(e.y)), w, h }
    while (placed.some((p) => overlaps(p, item))) item.y++
    placed.push(item)
  }
  for (const l of tab.layout) {
    if (placed.some((p) => p.i === l.i)) continue
    placed.push(placed.some((p) => overlaps(p, l)) ? { ...l, ...findSlot(placed, l.w, l.h) } : { ...l })
  }
  return compact(placed)
}

/** Executes "ui" tools requested by the harness via the bridge. Results go back to the agent. */
export async function runUiTool(name: string, a: A, ctx: { runId?: string; threadId?: string }): Promise<unknown> {
  await marketsReady()
  const ws = useWorkspaces.getState()
  switch (name) {
    case 'create_workspace': {
      const id = ws.createCustom(String(a.title ?? 'Workspace'), ctx.threadId)
      nav.go(`/workspaces/${id}`)
      // The chat window morphs into the workspace's docked panel.
      useUI.getState().setChatMode('docked')
      return { workspaceId: id, reference: `[[workspace:${id}]]` }
    }
    case 'add_widget': {
      const tab = ws.tabs.find((t) => t.id === a.workspaceId)
      if (!tab || tab.kind !== 'custom') throw new Error('Unknown workspaceId; call create_workspace first')
      const w = ws.addWidget(tab.id, { kind: a.kind as WidgetKind, coin: need(a.coin), title: a.title, subtitle: a.subtitle, status: 'drawing' })
      if (ws.active !== tab.id) ws.setActive(tab.id)
      return { widgetId: w.id, title: w.title }
    }
    case 'list_workspaces':
      return {
        active: ws.active,
        grid: { cols: GRID_COLS, rowsPerScreen: 24 },
        tabs: ws.tabs.map((t) =>
          t.kind === 'market'
            ? { workspaceId: t.id, kind: 'market', coin: t.coin }
            : {
                workspaceId: t.id,
                kind: 'custom',
                title: t.title,
                autoLayout: t.autoLayout,
                widgets: t.widgets.map((w) => ({ widgetId: w.id, kind: w.kind, coin: w.coin || undefined, title: w.title, minSize: minSize(w.kind) })),
                layout: layoutOut(t.layout),
              },
        ),
      }
    case 'arrange_workspace': {
      const tab = customTab(a.workspaceId)
      if (a.tidy) ws.retile(tab.id)
      else {
        if (!Array.isArray(a.layout) || !a.layout.length) throw new Error('Pass layout (a position for one or more widgets) or tidy: true')
        ws.setLayout(tab.id, arrange(tab, a.layout))
      }
      return { layout: layoutOut(customTab(tab.id).layout) }
    }
    case 'swap_widgets': {
      const tab = customTab(a.workspaceId)
      const [wa, wb] = [widgetOf(tab, a.a), widgetOf(tab, a.b)]
      const la = tab.layout.find((l) => l.i === wa.id)
      const lb = tab.layout.find((l) => l.i === wb.id)
      if (!la || !lb) throw new Error('Widget has no position yet')
      ws.setLayout(
        tab.id,
        compact(tab.layout.map((l) => (l.i === wa.id ? { ...lb, i: wa.id } : l.i === wb.id ? { ...la, i: wb.id } : l))),
      )
      return { layout: layoutOut(customTab(tab.id).layout) }
    }
    case 'update_widget': {
      const tab = customTab(a.workspaceId)
      const w = widgetOf(tab, a.widgetId)
      const patch: Record<string, string> = {}
      if (a.coin != null && w.kind !== 'note' && w.kind !== 'positions') patch.coin = need(a.coin)
      if (a.title != null) patch.title = String(a.title)
      if (a.subtitle != null) patch.subtitle = String(a.subtitle)
      if (a.markdown != null && w.kind === 'note') patch.body = String(a.markdown)
      ws.updateWidget(tab.id, w.id, patch)
      return { widgetId: w.id, updated: Object.keys(patch) }
    }
    case 'remove_widget': {
      const tab = customTab(a.workspaceId)
      ws.removeWidget(tab.id, widgetOf(tab, a.widgetId).id)
      return { removed: String(a.widgetId), layout: layoutOut(customTab(tab.id).layout) }
    }
    case 'rename_workspace': {
      const tab = customTab(a.workspaceId)
      ws.rename(tab.id, String(a.title ?? '').trim() || tab.title)
      return { workspaceId: tab.id, title: customTab(tab.id).title }
    }
    case 'reorder_workspaces': {
      const ids = (a.order as unknown[]).map(String)
      const unknown = ids.filter((id) => !ws.tabs.some((t) => t.id === id))
      if (unknown.length) throw new Error(`Unknown workspace ids: ${unknown.join(', ')}`)
      ws.reorder(Array.from(new Set(ids)))
      return { order: useWorkspaces.getState().tabs.map((t) => t.id) }
    }
    case 'add_note': {
      const tab = ws.tabs.find((t) => t.id === a.workspaceId)
      if (!tab || tab.kind !== 'custom') throw new Error('Unknown workspaceId')
      const w = ws.addWidget(tab.id, { kind: 'note', coin: '', title: String(a.title), subtitle: '', body: String(a.markdown ?? '') })
      return { widgetId: w.id }
    }
    case 'open_market': {
      const coin = need(a.coin)
      const id = ws.openMarket(coin)
      nav.go(`/workspaces/${id}`)
      return { opened: coin }
    }
    case 'create_scan': {
      const id = `ai-${Math.random().toString(36).slice(2, 7)}`
      usePrefs.getState().addScan({
        id,
        name: String(a.name),
        assetClasses: a.assetClasses,
        industries: a.industries,
        regions: a.regions,
        coins: (a.coins as string[] | undefined)?.map((c) => resolveCoin(c)).filter(Boolean) as string[] | undefined,
        minChangePct: a.minChangePct,
        maxChangePct: a.maxChangePct,
        minVolume: a.minVolume,
        sort: a.sortBy ? { key: a.sortBy as SortKey, dir: 'desc' } : undefined,
      })
      nav.go('/')
      return { scanId: id }
    }
    case 'get_portfolio': {
      const s = useAccount.getState()
      if (!s.address) return { connected: false }
      const names = useMarkets.getState().markets
      return {
        connected: true,
        address: s.address,
        portfolioValue: s.portfolioValue,
        pnl24h: s.pnl24h,
        withdrawable: s.withdrawable,
        positions: s.positions.map((p) => ({ ...p, name: names[p.coin]?.name })),
        openOrders: s.openOrders,
      }
    }
    case 'propose_order': {
      const o: ProposedOrder = {
        coin: need(a.coin),
        side: a.side === 'short' ? 'short' : 'long',
        usd: Number(a.usd),
        leverage: Number(a.leverage ?? 5),
        type: a.type === 'limit' ? 'limit' : 'market',
        limitPx: a.limitPx,
        takeProfit: a.takeProfit,
        stopLoss: a.stopLoss,
        reason: a.reason,
      }
      useChat.getState().attachOrder(ctx.runId, ctx.threadId, o)
      return { status: 'Ticket shown to the user. Nothing has been placed; the user must confirm it.' }
    }
  }
  throw new Error(`Unknown UI tool ${name}`)
}
