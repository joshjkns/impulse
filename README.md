# Impulse

An AI trading terminal for Hyperliquid: crypto perps and HIP-3 markets (equities, indices, commodities, FX), with an agent that builds live workspaces, watches the market and drafts trades. The agent is **your own** local coding harness — Claude Code, Codex, Grok, Gemini CLI, pi, oh-my-pi, OpenCode, Cursor CLI, Amp, Qwen Code, Factory Droid, or any custom command.

## Run it

```sh
pnpm install
pnpm dev          # web app (Vite) + local bridge
```

Open the URL Vite prints. `pnpm web` and `pnpm bridge` run the two halves separately.

## Desktop app

Impulse also ships as an Electron app. It bundles the bridge, so there's nothing to run in a terminal.

```sh
pnpm app:dev      # Vite with hot reload inside the Electron window
pnpm app          # build, then run the production app locally
pnpm dist         # package for this OS → release/ (dist:mac, dist:win, dist:linux for a specific one)
```

- The main process (`electron/main.ts`) starts `bridge/server.ts` with Electron's own Node, so users don't need Node installed. If a bridge is already listening on `7420` (e.g. `pnpm dev`), the app uses that one instead.
- The UI is served from `impulse://app/`, so local storage (workspaces, layouts, chats) persists across launches.
- Packaged builds keep bridge state in the OS user-data folder (Help ▸ Open data folder) instead of `.impulse/`; the bridge log is under Help ▸ Bridge log.
- On macOS the app keeps running with its window closed, so alerts keep firing and arrive as native notifications.
- Wallets in the app:
  - **Browser wallet** (Phantom, MetaMask, Rabby, any extension): Electron can't load extensions, so Connect opens a small pairing page (`wallet.html`) in your normal browser. Pick the wallet there and keep the tab open. The bridge relays every wallet request (connect, enabling trading, deposits, withdrawals) to it, and you approve in the extension as usual (`bridge/wallet.ts`, `src/wallet/browserWallet.ts`).
  - **Coinbase Wallet** opens its own popup window inside the app.
  - **WalletConnect / mobile wallets** pair by QR code when `VITE_WALLETCONNECT_PROJECT_ID` is set at build time.
- Builds are unsigned. For signed/notarised macOS builds set the usual electron-builder env vars (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, …) before `pnpm dist:mac`.

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
| Grid | react-grid-layout v2 (custom workspaces), react-resizable-panels (market layout) |
| Toasts | Sonner |
| Market data & trading | `@nktkas/hyperliquid` (REST + WebSocket), main dex + `xyz` HIP-3 dex |
| Wallet | wagmi + RainbowKit on Arbitrum; deposits via the official USDC bridge |
| Agent tools | Model Context Protocol (`@modelcontextprotocol/sdk`) |

**Trading** is non-custodial. On first order Impulse asks your wallet to approve a locally generated Hyperliquid agent key (the same pattern the official app uses), then signs orders in the browser. The agent can only *propose* orders (`propose_order` shows an editable ticket); nothing executes until you press Place.

## Workspaces

- **Custom workspaces** sit on a 24 × 24 grid that fills the screen. Drag a widget by its header; drop it on another widget to swap the two, or on open space to place it there. Resize from any edge or corner. Widgets that share an edge resize together, like split panes, and stop at each other's minimum size. Save ▸ Tidy layout goes back to even auto-tiling.
- **Market tabs** (chart · order book · ticket · positions) have draggable splits. The sizes are shared by every market tab.
- **The Impulse chat** floats as a window you can drag by its header and resize from any edge or corner (double-click the header to reset). On a workspace, drop it on the right edge to dock it; the docked panel resizes from its left edge, and dragging its header out floats it again. Position and sizes are remembered.

## The bridge

`bridge/` is a small Node daemon (no build step, Node ≥ 22.18 strips the types):

```
browser ──ws──▶ bridge ──spawn──▶ your harness (claude -p, codex exec, grok -p, …)
                  ▲                       │
                  └──── POST /call ◀── impulse MCP server (bridge/mcp.ts)
```

- The picker under the chat box shows the provider (harness) and model each chat runs on; switch either per chat, search the suggested models, or type any model id. Settings ▸ AI agent sets a default model per provider (used when a chat is on *Default*). The model goes to the harness's own model flag (`$IMPULSE_MODEL` for a custom command); suggestions come from `bridge/harnesses.ts`, plus `opencode models` when OpenCode is installed.
- **Custom agents** (Settings ▸ Agents, or the name at the top of any chat): give Impulse a name, a glyph, a colour and your own instructions — a persona, a strategy, a house style. The instructions are appended to Impulse's system prompt for that agent's replies (they can override style, not tool use: agents still only propose orders). Each chat talks to one agent and can switch; switching starts a fresh harness session with the transcript carried over. Agents live in the browser's local storage (`impulse.agents`).
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
- `node scripts/perf.mjs [seconds]` — renderer CPU per page against a mocked Hyperliquid feed (no network needed); run it against `pnpm build && pnpm preview --port 5180`. `DRAG=1` times a widget drag and resize, `PROFILE=n` lists the top n functions (build with `--sourcemap` for names), `TRACE=1` splits paint/commit/script, `LATENCY=ms` simulates network delay for the startup timing
