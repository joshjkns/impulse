import { z } from 'zod'

/**
 * Every tool Impulse exposes to a harness. `target` decides where it runs:
 *  - "bridge": executed in the bridge against Hyperliquid / news APIs
 *  - "ui": forwarded to the open Impulse tab (workspaces, scans, order tickets, wallet state)
 * The same list powers the MCP stdio server and the plain CLI fallback for harnesses without MCP.
 */
export interface ToolDef {
  name: string
  description: string
  shape: z.ZodRawShape
  target: 'bridge' | 'ui'
  /** Short present-tense label for the step list, e.g. "Reading CL candles". */
  label: (args: Record<string, unknown>) => string
}

const coin = z
  .string()
  .describe('Market id or name. Crypto perps use the ticker ("BTC"); HIP-3 markets use the dex prefix ("xyz:CL", "xyz:NVDA"). Names like "crude oil" are resolved.')

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
] as const

const sym = (a: Record<string, unknown>) => String(a.coin ?? '').replace(/^xyz:/, '')

export const TOOLS: ToolDef[] = [
  {
    name: 'list_markets',
    target: 'bridge',
    description:
      'List tradable Hyperliquid perpetuals (crypto + HIP-3 equities, indices, commodities, FX) with price, 24h change, volume, open interest and funding. Filter by text, asset class or industry.',
    shape: {
      query: z.string().optional().describe('Free-text match on ticker or name'),
      assetClass: z.enum(['Crypto', 'Equities', 'Commodities', 'Indices', 'FX']).optional(),
      industry: z.string().optional().describe('e.g. Semiconductors, Memory, AI, Energy, Metals'),
      sortBy: z.enum(['volume', 'change', 'openInterest', 'funding']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    label: () => 'Scanning markets',
  },
  {
    name: 'get_market',
    target: 'bridge',
    description: 'Live snapshot of one market: mark/oracle price, 24h change, volume, open interest, funding (hourly and annualised), max leverage and smart-money positioning.',
    shape: { coin },
    label: (a) => `Reading ${sym(a)} market`,
  },
  {
    name: 'get_candles',
    target: 'bridge',
    description: 'OHLCV candles. Returns at most 300 rows plus summary stats (return, high, low, realised volatility).',
    shape: {
      coin,
      interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('1h'),
      lookbackHours: z.number().min(1).max(24 * 365).default(72),
    },
    label: (a) => `Reading ${sym(a)} candles`,
  },
  {
    name: 'get_orderbook',
    target: 'bridge',
    description: 'L2 order book snapshot with aggregated depth and bid/ask imbalance.',
    shape: { coin, levels: z.number().int().min(1).max(50).default(20) },
    label: (a) => `Reading ${sym(a)} order book`,
  },
  {
    name: 'get_funding_history',
    target: 'bridge',
    description: 'Hourly funding history with averages, annualised.',
    shape: { coin, days: z.number().min(1).max(90).default(14) },
    label: (a) => `Reading ${sym(a)} funding`,
  },
  {
    name: 'get_recent_trades',
    target: 'bridge',
    description: 'Most recent public trades with buy/sell volume split.',
    shape: { coin },
    label: (a) => `Reading ${sym(a)} tape`,
  },
  {
    name: 'get_smart_money',
    target: 'bridge',
    description:
      'Positioning of traders with $1M+ all-time PnL on Hyperliquid for a market: long/short notional, trader count and 24h change in shorts/longs.',
    shape: { coin },
    label: (a) => `Checking smart money on ${sym(a)}`,
  },
  {
    name: 'search_news',
    target: 'bridge',
    description:
      'Search recent global news headlines (GDELT). Use for macro, geopolitics and company news. Query syntax: quote phrases, wrap OR groups in parentheses, e.g. ("Strait of Hormuz" OR OPEC OR ceasefire) oil.',
    shape: { query: z.string(), hours: z.number().min(1).max(168).default(24), limit: z.number().int().min(1).max(30).default(10) },
    label: (a) => `Searching news for "${String(a.query ?? '').slice(0, 32)}"`,
  },
  {
    name: 'create_alert',
    target: 'bridge',
    description: [
      'Create a persistent alert. The bridge evaluates it continuously and notifies the user in the app and on their phone.',
      'kinds: price (op above|below, value), change (pct move in 24h, value = absolute %), funding (annualised %, op/value),',
      'open_interest (USD, op/value), smart_money (direction short|long; fires when $1M+ traders turn net that way or add',
      '`addedUsd` of that side within 24h), news (query: GDELT search; fires on new matching headlines).',
    ].join(' '),
    shape: {
      title: z.string().describe('Short human title, e.g. "Smart money shorting Crude Oil"'),
      description: z.string().describe('One sentence describing exactly when it fires'),
      kind: z.enum(['price', 'change', 'funding', 'open_interest', 'smart_money', 'news']),
      coin: coin.optional(),
      op: z.enum(['above', 'below']).optional(),
      value: z.number().optional(),
      direction: z.enum(['long', 'short']).optional(),
      addedUsd: z.number().optional(),
      query: z.string().optional(),
      icon: z.enum(['bell', 'globe', 'chart', 'bolt']).optional(),
    },
    label: (a) => `Creating alert "${String(a.title ?? '')}"`,
  },
  {
    name: 'list_alerts',
    target: 'bridge',
    description: 'List active alerts.',
    shape: {},
    label: () => 'Listing alerts',
  },
  {
    name: 'delete_alert',
    target: 'bridge',
    description: 'Delete an alert by id.',
    shape: { id: z.string() },
    label: () => 'Removing alert',
  },
  {
    name: 'set_briefing',
    target: 'bridge',
    description: 'Publish the Home screen "Market Briefing": one or two sentences plus up to 3 short headline bullets.',
    shape: {
      text: z.string(),
      bullets: z.array(z.object({ text: z.string(), coin: coin.optional() })).max(3).default([]),
    },
    label: () => 'Writing market briefing',
  },
  {
    name: 'create_workspace',
    target: 'ui',
    description:
      'Create a new workspace tab and switch the user to it. Returns workspaceId. Use this before add_widget when building a dashboard or summary. Mention it in your reply as [[workspace:<id>]].',
    shape: { title: z.string().describe('e.g. "CL market summary"') },
    label: (a) => `Creating workspace "${String(a.title ?? '')}"`,
  },
  {
    name: 'add_widget',
    target: 'ui',
    description: [
      'Add a live widget to a workspace. Widgets draw from live Hyperliquid data themselves; you only choose kind and market.',
      'price_oi: price with open interest underneath. orderbook_heatmap: resting liquidity by price over time.',
      'funding: annualised funding bars. volume_profile: up/down volume by price over 30 days.',
      'liquidations: hours with the most liquidations marked on price. monthly_returns: heatmap of monthly returns.',
      'candles, orderbook, trades, positions: standard trading panels.',
    ].join(' '),
    shape: {
      workspaceId: z.string(),
      kind: z.enum(WIDGET_KINDS),
      coin,
      title: z.string().optional(),
      subtitle: z.string().optional(),
    },
    label: (a) => `Drawing ${String(a.kind ?? 'widget').replace(/_/g, ' ')}`,
  },
  {
    name: 'list_workspaces',
    target: 'ui',
    description: [
      'List open workspace tabs in tab order, which one is active, and for custom workspaces their widgets and layout.',
      'Layout is on a 24 x 24 grid that fills the screen: x (column, 0-23), y (row, 0 = top), w and h in grid units.',
      'Rows below 24 sit below the fold and scroll. Use before rearranging, renaming or removing anything.',
    ].join(' '),
    shape: {},
    label: () => 'Reading workspaces',
  },
  {
    name: 'arrange_workspace',
    target: 'ui',
    description: [
      'Rearrange the widgets of a custom workspace on its 24 x 24 grid. Give a position for each widget you want to place:',
      'widgets you list are placed in order (one that would overlap an earlier one is pushed down), widgets you leave out keep',
      'their place where it is free. Sizes are clamped to each widget\'s minimum (about 5 x 5; order books 4 x 6; notes 4 x 3).',
      'Gaps close upwards, as on screen. Or pass tidy: true to drop the manual layout and evenly auto-tile every widget.',
      'Returns the resulting layout. To fill the screen, make the rows of widgets add up to h = 24.',
    ].join(' '),
    shape: {
      workspaceId: z.string(),
      layout: z
        .array(z.object({ widgetId: z.string(), x: z.number().int().min(0).max(23), y: z.number().int().min(0), w: z.number().int().min(1).max(24), h: z.number().int().min(1).max(48) }))
        .optional(),
      tidy: z.boolean().optional(),
    },
    label: () => 'Rearranging workspace',
  },
  {
    name: 'swap_widgets',
    target: 'ui',
    description: 'Swap the positions and sizes of two widgets in a custom workspace, like dragging one onto the other.',
    shape: { workspaceId: z.string(), a: z.string().describe('widgetId'), b: z.string().describe('widgetId') },
    label: () => 'Swapping widgets',
  },
  {
    name: 'update_widget',
    target: 'ui',
    description: "Change a widget's market, title or subtitle (or a note's markdown). Its kind can't change: remove it and add another.",
    shape: { workspaceId: z.string(), widgetId: z.string(), coin: coin.optional(), title: z.string().optional(), subtitle: z.string().optional(), markdown: z.string().optional() },
    label: () => 'Updating widget',
  },
  {
    name: 'remove_widget',
    target: 'ui',
    description: 'Remove a widget from a custom workspace.',
    shape: { workspaceId: z.string(), widgetId: z.string() },
    label: () => 'Removing widget',
  },
  {
    name: 'rename_workspace',
    target: 'ui',
    description: 'Rename a custom workspace tab.',
    shape: { workspaceId: z.string(), title: z.string() },
    label: (a) => `Renaming workspace to "${String(a.title ?? '')}"`,
  },
  {
    name: 'reorder_workspaces',
    target: 'ui',
    description: 'Reorder the workspace tabs. Pass workspace ids in the new order; tabs you leave out keep their relative order after them.',
    shape: { order: z.array(z.string()).min(1) },
    label: () => 'Reordering tabs',
  },
  {
    name: 'add_note',
    target: 'ui',
    description: 'Add a markdown note widget to a workspace (theses, levels, checklists).',
    shape: { workspaceId: z.string(), title: z.string(), markdown: z.string() },
    label: () => 'Writing note',
  },
  {
    name: 'open_market',
    target: 'ui',
    description: "Open a market's trading workspace (chart, order book, order ticket).",
    shape: { coin },
    label: (a) => `Opening ${sym(a)}`,
  },
  {
    name: 'create_scan',
    target: 'ui',
    description: 'Save a Market Scan (a named filter) in the Home sidebar and select it.',
    shape: {
      name: z.string(),
      assetClasses: z.array(z.enum(['Crypto', 'Equities', 'Commodities', 'Indices', 'FX'])).optional(),
      industries: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      coins: z.array(z.string()).optional(),
      minChangePct: z.number().optional(),
      maxChangePct: z.number().optional(),
      minVolume: z.number().optional(),
      sortBy: z.enum(['changePct', 'dayNtlVlm', 'openInterest', 'funding']).optional(),
    },
    label: (a) => `Creating scan "${String(a.name ?? '')}"`,
  },
  {
    name: 'get_portfolio',
    target: 'ui',
    description: "The connected wallet's portfolio value, open positions and open orders. Empty if no wallet is connected.",
    shape: {},
    label: () => 'Reading your portfolio',
  },
  {
    name: 'propose_order',
    target: 'ui',
    description:
      'Show the user an order ticket pre-filled with your suggestion. Nothing executes until the user reviews and presses Place. Never claim an order was placed.',
    shape: {
      coin,
      side: z.enum(['long', 'short']),
      usd: z.number().positive().describe('Order size as notional in USDC (the ticket "Size" field), not margin. "2,500 USDC at 20x" means usd = 2500.'),
      leverage: z.number().min(1).max(50).default(5),
      type: z.enum(['market', 'limit']).default('market'),
      limitPx: z.number().optional(),
      takeProfit: z.number().optional(),
      stopLoss: z.number().optional(),
      reason: z.string().optional(),
    },
    label: (a) => `Preparing ${String(a.side ?? '')} ${sym(a)} ticket`,
  },
]

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n.replace(/^mcp__impulse__/, ''))

export const SYSTEM_PROMPT = `You are Impulse, the AI inside a trading terminal for Hyperliquid perpetuals (crypto plus HIP-3 equities, indices and commodities such as xyz:CL WTI crude, xyz:SP500, xyz:NVDA).
You act only through the "impulse" tools. Use them to read live data before making claims, build dashboards with create_workspace + add_widget, and set alerts with create_alert.

Style:
- Reply like a sharp desk analyst in a chat bubble: short paragraphs, concrete numbers, no headings, no tables, no emojis.
- Bold the market name the first time with **name**.
- When you built a workspace, reference it inline as [[workspace:<id>]] so it renders as a link chip.
- You can put live components in a reply by writing tokens in your text, and the app renders them in the bubble:
  [[ticker:BTC]] or [[ticker:BTC,ETH,xyz:CL]] for inline live price chips (use these instead of typing prices when naming a few markets);
  [[chart:BTC]] or [[chart:xyz:CL:4h]] for a live candle chart (interval 1m, 5m, 15m, 1h, 4h or 1d; default 1h);
  [[widget:<kind>:<coin>]] for any add_widget kind, e.g. [[widget:funding:BTC]], [[widget:orderbook:ETH]], [[widget:volume_profile:xyz:NVDA]].
  Charts and widgets show on their own line. Use at most two or three per reply, only where a picture beats a number; for a full dashboard build a workspace instead.
- To change an existing workspace, call list_workspaces first, then arrange_workspace, swap_widgets, update_widget, remove_widget, rename_workspace or reorder_workspaces.
- After creating alerts, reply with exactly two short paragraphs: a one-line confirmation like "Done. Two alerts are live.", then one line about where notifications will arrive. The app renders the alert cards between them, so never describe the alerts or their internals.
- Never place trades. For trade ideas use propose_order, which only pre-fills a ticket for the user.
- When asked for a market summary, create a workspace titled "<SYMBOL> market summary" and add 6 widgets in this order: price_oi, orderbook_heatmap, funding, volume_profile, liquidations, monthly_returns. Then reply with a 3-4 sentence read of the market.`
