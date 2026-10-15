# Impulse

An AI trading terminal for Hyperliquid: crypto perps and HIP-3 markets (equities, indices, commodities, FX), with an agent that builds live workspaces, watches the market and drafts trades. The agent is **your own** local coding harness — Claude Code, Codex, Grok, Gemini CLI, pi, oh-my-pi, OpenCode, Cursor CLI, Amp, Qwen Code, Factory Droid, or any custom command.

## Run it

```sh
pnpm install
pnpm dev          # web app (Vite) + local bridge
```

Open the URL Vite prints. `pnpm web` and `pnpm bridge` run the two halves separately.

Optional `.env.local`:

```sh
VITE_WALLETCONNECT_PROJECT_ID=…   # enables WalletConnect / mobile wallets (extension wallets work without it)
```

## What's inside

| Area | Built on |
| --- | --- |
| UI kit | shadcn/ui (Radix) + Tailwind v4, Inter, lucide icons |
| Motion | Motion (shared-layout chat morph, springs, blur-ins) |
| Charts | TradingView lightweight-charts v5; canvas order-book heatmap |
| Grid | react-grid-layout v2 |
| Toasts | Sonner |
| Market data & trading | `@nktkas/hyperliquid` (REST + WebSocket), main dex + `xyz` HIP-3 dex |
| Wallet | wagmi + RainbowKit on Arbitrum; deposits via the official USDC bridge |
| Agent tools | Model Context Protocol (`@modelcontextprotocol/sdk`) |

**Trading** is non-custodial. On first order Impulse asks your wallet to approve a locally generated Hyperliquid agent key (the same pattern the official app uses), then signs orders in the browser. The agent can only *propose* orders (`propose_order` shows an editable ticket); nothing executes until you press Place.

## The bridge

`bridge/` is a small Node daemon (no build step, Node ≥ 22.18 strips the types):

```
browser ──ws──▶ bridge ──spawn──▶ your harness (claude -p, codex exec, grok -p, …)
                  ▲                       │
                  └──── POST /call ◀── impulse MCP server (bridge/mcp.ts)
```

- Each chat message spawns the selected harness in a run folder with the Impulse MCP server configured for it. Harnesses without MCP (pi, Droid, custom) get a shell CLI instead: `node bridge/cli.ts <tool> '<json>'`.
- Tool calls stream back as the "Working · N steps" list. Data tools run in the bridge; UI tools (create workspace, add widget, create scan, propose order, read portfolio) run in the tab that sent the message.
- **Alerts** (price, 24h change, funding, open interest, smart money, news) live in the bridge, so they keep running with the tab closed. Hits go to the app, macOS notifications, and your phone via an [ntfy](https://ntfy.sh) topic set in Settings.
- **Smart money** = Hyperliquid accounts with ≥ $1M all-time PnL (from the public leaderboard); the bridge polls the largest 100 and aggregates their long/short notional per market.
- **News** comes from GDELT (free, keyless).
- Open interest history isn't exposed by Hyperliquid, so the bridge records it hourly.

The bridge listens on `127.0.0.1:7420` and rejects non-localhost origins. State lives in `.impulse/` (gitignored).

Use the tools from your harness directly too:

```sh
claude mcp add impulse -- node "$(pwd)/bridge/mcp.ts"
```

## Dev scripts

- `node scripts/shot.mjs <path> <out.png>` — screenshot a route
- `node scripts/e2e-chat.mjs "<prompt>" <outDir> [path]` — drive a full chat run in a headless browser
- `node scripts/harness-check.mjs claude grok opencode …` — confirm each harness can call Impulse tools
