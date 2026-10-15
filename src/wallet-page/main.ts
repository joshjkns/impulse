/**
 * Browser-wallet pairing page. The Impulse desktop app opens this in the user's normal browser (where Phantom,
 * MetaMask, Rabby… are installed) with a pairing token in the URL hash. It connects to the local bridge with
 * that token and runs the app's wallet requests against the chosen extension. See bridge/wallet.ts.
 */
import '@fontsource-variable/inter'

interface Eip1193 {
  request(args: { method: string; params?: unknown }): Promise<unknown>
  on?(event: string, fn: (data: unknown) => void): void
  removeListener?(event: string, fn: (data: unknown) => void): void
}
interface Detail {
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: Eip1193
}

const BRIDGE_WS = (import.meta.env.VITE_IMPULSE_BRIDGE as string | undefined) ?? 'ws://127.0.0.1:7420/ws'
const token = location.hash.slice(1)
const LAST_KEY = 'impulse.walletPage.rdns'

const app = document.getElementById('app')!
const style = document.createElement('style')
style.textContent = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101012; color: #ececef;
    font: 13px/1.5 "Inter Variable", ui-sans-serif, system-ui; -webkit-font-smoothing: antialiased; }
  .card { width: min(380px, calc(100vw - 32px)); background: #18171c; border: 1px solid #24242a; border-radius: 16px; padding: 22px; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 15px; margin-bottom: 14px; }
  .brand svg { width: 24px; height: 24px; }
  h1 { font-size: 15px; font-weight: 500; margin: 0 0 4px; }
  p { margin: 0; color: #8d8d96; }
  .list { display: grid; gap: 6px; margin-top: 16px; }
  button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px;
    background: #202126; border: 1px solid #2a2a31; transition: background .12s; }
  button:hover { background: #26262c; }
  button img { width: 24px; height: 24px; border-radius: 6px; }
  .row { display: flex; align-items: center; gap: 10px; margin-top: 16px; padding: 10px 12px; border-radius: 10px; background: #202126; }
  .row img { width: 28px; height: 28px; border-radius: 7px; }
  .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #c9c9cf; }
  .dot { width: 7px; height: 7px; border-radius: 99px; background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.15); margin-left: auto; }
  .muted { color: #5f5f68; font-size: 12px; margin-top: 14px; }
  .activity { margin-top: 10px; font-size: 12px; color: #8d8d96; min-height: 18px; }
  .link { all: unset; cursor: pointer; color: #8d8d96; font-size: 12px; margin-top: 12px; display: inline-block; text-decoration: underline; text-underline-offset: 3px; }
`
document.head.append(style)

const LOGO = `<svg viewBox="0 0 32 32" fill="none"><g transform="translate(4 4) scale(.75)" stroke="#ececef" stroke-linecap="round"><circle cx="16" cy="16" r="4.2" fill="#ececef" stroke="none"/><circle cx="16" cy="16" r="9" stroke-width="2.4" stroke-dasharray="12 4.2 6 4.2" transform="rotate(-28 16 16)"/><circle cx="16" cy="16" r="14" stroke-width="2" stroke-dasharray="20 6 9 6 4 6" transform="rotate(64 16 16)" opacity=".75"/></g></svg>`

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const CHAINS: Record<number, string> = { 1: 'Ethereum', 42161: 'Arbitrum', 8453: 'Base', 10: 'Optimism', 137: 'Polygon' }

/* ------------------------------------------------------------------ wallet discovery (EIP-6963) */

const wallets = new Map<string, Detail>()
window.addEventListener('eip6963:announceProvider', (e) => {
  const d = (e as CustomEvent<Detail>).detail
  if (!d?.info?.rdns || wallets.has(d.info.rdns)) return
  wallets.set(d.info.rdns, d)
  if (state.kind === 'pick') render()
})

function legacy(): Detail | undefined {
  const eth = (window as unknown as { ethereum?: Eip1193 & { isMetaMask?: boolean; isPhantom?: boolean } }).ethereum
  if (!eth || wallets.size) return
  const name = eth.isPhantom ? 'Phantom' : eth.isMetaMask ? 'MetaMask' : 'Browser wallet'
  return { info: { uuid: 'legacy', name, icon: '', rdns: 'legacy' }, provider: eth }
}

/* ------------------------------------------------------------------ state */

type State =
  | { kind: 'no-token' }
  | { kind: 'offline' }
  | { kind: 'pick'; error?: string }
  | { kind: 'connecting'; wallet: Detail }
  | { kind: 'connected'; wallet: Detail; account: string; chainId: number; activity?: string }
  | { kind: 'replaced' }

let state: State = token.length >= 16 ? { kind: 'offline' } : { kind: 'no-token' }
let ws: WebSocket | undefined
let unbind: (() => void) | undefined

function render() {
  const head = `<div class="brand">${LOGO}<span>Impulse</span></div>`
  let body = ''
  switch (state.kind) {
    case 'no-token':
      body = `<h1>Open this from Impulse</h1><p>In the Impulse app, choose Connect → Browser wallet. It opens this page with a pairing code.</p>`
      break
    case 'offline':
      body = `<h1>Looking for Impulse…</h1><p>Make sure the Impulse app is running on this computer.</p>`
      break
    case 'replaced':
      body = `<h1>Opened in another tab</h1><p>Impulse is using a newer copy of this page. You can close this tab.</p>`
      break
    case 'pick': {
      const list = [...wallets.values(), ...(legacy() ? [legacy()!] : [])]
      body =
        `<h1>Connect a wallet to Impulse</h1><p>Your wallet stays in this browser. Impulse sends requests here, and you approve them in the wallet as usual.</p>` +
        (list.length
          ? `<div class="list">${list.map((w) => `<button data-rdns="${esc(w.info.rdns)}">${w.info.icon ? `<img src="${esc(w.info.icon)}" alt="">` : ''}<span>${esc(w.info.name)}</span></button>`).join('')}</div>`
          : `<p class="muted">No wallet extension found in this browser. Install Phantom, MetaMask or Rabby, then reload this page.</p>`) +
        (state.error ? `<p class="activity" style="color:#ef4060">${esc(state.error)}</p>` : '')
      break
    }
    case 'connecting':
      body = `<h1>Approve in ${esc(state.wallet.info.name)}</h1><p>Accept the connection request in your wallet.</p>`
      break
    case 'connected':
      body =
        `<h1>Connected to Impulse</h1><p>Keep this tab open while you use Impulse. Signature requests from the app appear in your wallet.</p>` +
        `<div class="row">${state.wallet.info.icon ? `<img src="${esc(state.wallet.info.icon)}" alt="">` : ''}<div><div>${esc(state.wallet.info.name)}</div><div class="mono">${short(state.account)} · ${CHAINS[state.chainId] ?? `chain ${state.chainId}`}</div></div><span class="dot"></span></div>` +
        `<div class="activity">${esc(state.activity ?? 'Waiting for requests from Impulse.')}</div>` +
        `<button class="link" id="disconnect">Disconnect</button>`
      break
  }
  app.innerHTML = `<div class="card">${head}${body}</div>`
  app.querySelectorAll<HTMLButtonElement>('[data-rdns]').forEach((b) => (b.onclick = () => void choose(b.dataset.rdns!)))
  const dc = document.getElementById('disconnect')
  if (dc) dc.onclick = () => void disconnect(true)
}

const send = (msg: Record<string, unknown>) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ ...msg, token }))

/* ------------------------------------------------------------------ wallet */

async function choose(rdns: string, silent = false) {
  const wallet = wallets.get(rdns) ?? (rdns === 'legacy' ? legacy() : undefined)
  if (!wallet) return
  if (!silent) {
    state = { kind: 'connecting', wallet }
    render()
  }
  try {
    const accounts = (await wallet.provider.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' })) as string[]
    if (!accounts?.length) {
      if (!silent) throw new Error('No account was shared')
      return
    }
    const chainId = Number(await wallet.provider.request({ method: 'eth_chainId' }))
    localStorage.setItem(LAST_KEY, rdns)
    bind(wallet)
    state = { kind: 'connected', wallet, account: accounts[0], chainId }
    render()
    send({ type: 'wallet_connected', accounts, chainId, name: wallet.info.name, icon: wallet.info.icon })
  } catch (e) {
    if (silent) return
    state = { kind: 'pick', error: e instanceof Error ? e.message : String(e) }
    render()
  }
}

function bind(wallet: Detail) {
  unbind?.()
  const p = wallet.provider
  const onAccounts = (a: unknown) => {
    const accounts = (a as string[]) ?? []
    send({ type: 'wallet_event', event: 'accountsChanged', data: accounts })
    if (state.kind !== 'connected') return
    if (!accounts.length) return void disconnect(false)
    state.account = accounts[0]
    render()
  }
  const onChain = (c: unknown) => {
    send({ type: 'wallet_event', event: 'chainChanged', data: c })
    if (state.kind !== 'connected') return
    state.chainId = Number(c)
    render()
  }
  const onDisconnect = () => send({ type: 'wallet_event', event: 'disconnect' })
  p.on?.('accountsChanged', onAccounts)
  p.on?.('chainChanged', onChain)
  p.on?.('disconnect', onDisconnect)
  unbind = () => {
    p.removeListener?.('accountsChanged', onAccounts)
    p.removeListener?.('chainChanged', onChain)
    p.removeListener?.('disconnect', onDisconnect)
  }
}

async function disconnect(notifyApp: boolean) {
  if (state.kind === 'connected') {
    // Not every wallet supports revoking; the app forgets the session either way.
    await state.wallet.provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => undefined)
  }
  unbind?.()
  localStorage.removeItem(LAST_KEY)
  if (notifyApp) send({ type: 'wallet_event', event: 'accountsChanged', data: [] })
  send({ type: 'wallet_connected', accounts: [], chainId: 0 })
  state = { kind: 'pick' }
  render()
}

const LABELS: Record<string, string> = {
  eth_signTypedData_v4: 'Signature requested',
  personal_sign: 'Signature requested',
  eth_sendTransaction: 'Transaction requested',
  wallet_switchEthereumChain: 'Network switch requested',
  wallet_addEthereumChain: 'Add network requested',
}

async function onRequest(id: string, method: string, params: unknown) {
  if (state.kind !== 'connected') return send({ type: 'wallet_res', id, error: { code: 4100, message: 'No wallet is connected on the browser page' } })
  const label = LABELS[method]
  if (label) {
    state.activity = `${label} — approve it in ${state.wallet.info.name}.`
    document.title = `● ${label} · Impulse`
    render()
  }
  try {
    const result = await state.wallet.provider.request({ method, params })
    send({ type: 'wallet_res', id, result })
    if (label && state.kind === 'connected') state.activity = `${label.replace(' requested', '')} approved.`
  } catch (e) {
    const err = e as { code?: number; message?: string }
    send({ type: 'wallet_res', id, error: { code: err.code, message: err.message ?? String(e) } })
    if (label && state.kind === 'connected') state.activity = `${label.replace(' requested', '')} rejected.`
  } finally {
    document.title = 'Impulse · Connect wallet'
    if (label) render()
  }
}

/* ------------------------------------------------------------------ bridge */

let retry = 0
function connect() {
  ws = new WebSocket(BRIDGE_WS)
  ws.onopen = () => {
    retry = 0
    send({ type: 'wallet_page' })
    if (state.kind === 'connected') {
      const { wallet, account, chainId } = state
      send({ type: 'wallet_connected', accounts: [account], chainId, name: wallet.info.name, icon: wallet.info.icon })
      return
    }
    state = { kind: 'pick' }
    render()
    // Coming back to an existing session: reconnect without a prompt if the wallet still trusts this page.
    const last = localStorage.getItem(LAST_KEY)
    if (last) setTimeout(() => void choose(last, true), 300)
  }
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as Record<string, unknown>
    if (msg.type === 'wallet_req') void onRequest(String(msg.id), String(msg.method), msg.params)
    else if (msg.type === 'wallet_disconnect') void disconnect(false)
    else if (msg.type === 'wallet_replaced') {
      state = { kind: 'replaced' }
      ws?.close()
      render()
    }
  }
  ws.onclose = () => {
    if (state.kind === 'replaced') return
    if (state.kind !== 'connected') state = { kind: 'offline' }
    render()
    setTimeout(connect, Math.min(10_000, 500 * 2 ** retry++))
  }
}

render()
window.dispatchEvent(new Event('eip6963:requestProvider'))
if (state.kind !== 'no-token') connect()
