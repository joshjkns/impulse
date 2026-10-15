import { useAccount } from '@/store/account'
import { useChat, type ProposedOrder } from '@/store/chat'
import { marketsReady, resolveCoin, useMarkets } from '@/store/markets'
import { usePrefs, type SortKey } from '@/store/prefs'
import { useUI } from '@/store/ui'
import { useWorkspaces, type WidgetKind } from '@/store/workspaces'

/** Router escape hatch so tools (which run outside React) can navigate. Set by <NavBinder/>. */
export const nav: { go: (path: string) => void } = { go: (p) => window.history.pushState({}, '', p) }

const need = (coin: unknown) => {
  const c = resolveCoin(String(coin ?? ''))
  if (!c) throw new Error(`Unknown market "${String(coin)}"`)
  return c
}

type A = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

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
